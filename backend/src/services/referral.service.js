/**
 * @file referral.service.js
 * @description Core business logic for hospital referral requests, responses, auto-cancellation, and clarification cycles.
 */

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const Referral = require('../models/Referral');
const Emergency = require('../models/Emergency');
const Hospital = require('../models/Hospital');
const emailService = require('./email.service');
const { emitReferralRequested, emitReferralResponded, emitEmergencyStatusUpdated } = require('../sockets/emitter');

class ReferralService {
  /**
   * Request a hospital referral for an emergency case
   * @param {Object} data - { caseId, hospitalId }
   * @param {Object} user - Authenticated user
   * @returns {Promise<Object>}
   */
  async create(data, user) {
    const { caseId, hospitalId } = data;

    // Load emergency case
    const isMongoId = mongoose.Types.ObjectId.isValid(caseId);
    const emergency = await Emergency.findOne(
      isMongoId ? { $or: [{ caseId }, { _id: caseId }] } : { caseId }
    );

    if (!emergency) {
      throw ApiError.notFound(`Emergency case '${caseId}' not found`);
    }

    // Verify status allows referral
    const allowedStatuses = ['registered', 'referral_pending'];
    if (!allowedStatuses.includes(emergency.status)) {
      throw ApiError.conflict(
        `Cannot create referral for case in status '${emergency.status}'. Allowed statuses: ${allowedStatuses.join(', ')}`
      );
    }

    // Load hospital and verify it is not closed
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw ApiError.notFound('Hospital not found');
    }
    if (hospital.status === 'closed') {
      throw ApiError.conflict(`Hospital '${hospital.name}' is closed and cannot receive referrals`);
    }

    // Check no existing pending or accepted referral for this case + hospital combo
    const existingReferral = await Referral.findOne({
      caseId: emergency.caseId,
      hospitalId: hospital._id,
      requestStatus: { $in: ['pending', 'clarification_requested', 'accepted'] }
    });

    if (existingReferral) {
      throw ApiError.conflict(
        `An active referral (${existingReferral.requestStatus}) already exists for hospital '${hospital.name}'`
      );
    }

    // Create new referral
    const referral = await Referral.create({
      caseId: emergency.caseId,
      hospitalId: hospital._id,
      requestStatus: 'pending',
      requestedBy: user._id || user.id,
      requestedAt: new Date()
    });

    // If emergency status is 'registered', update to 'referral_pending'
    if (emergency.status === 'registered') {
      emergency.status = 'referral_pending';
      emergency.version = (emergency.version || 1) + 1;
      await emergency.save();
      emitEmergencyStatusUpdated(emergency);
    }

    // Audit trail
    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'referral_requested',
      recordType: 'Referral',
      recordId: referral._id,
      after: referral
    });

    // Populate relations
    const populated = await Referral.findById(referral._id)
      .populate('hospitalId', 'name location contactPhone status specialties')
      .populate('requestedBy', 'name email role');

    emitReferralRequested(populated || referral);

    return populated || referral;
  }

  /**
   * List referrals scoped by user role and permissions
   * @param {Object} user - Authenticated user
   * @param {Object} [filters={}] - Optional query filters
   * @returns {Promise<Array<Object>>}
   */
  async list(user, filters = {}) {
    const query = {};

    if (filters.caseId) {
      query.caseId = filters.caseId;
    }
    if (filters.requestStatus) {
      query.requestStatus = filters.requestStatus;
    }

    // Hospital staff and admin are scoped strictly to their hospital
    if (['hospital_staff', 'hospital_admin'].includes(user.role)) {
      if (!user.hospitalId) {
        throw ApiError.forbidden('User does not have an assigned hospital');
      }
      query.hospitalId = user.hospitalId;
    }

    return Referral.find(query)
      .populate('hospitalId', 'name location contactPhone status specialties')
      .populate('requestedBy', 'name email role')
      .populate('respondedBy', 'name email role')
      .sort({ createdAt: -1 });
  }

  /**
   * Respond to a pending referral (accepted, rejected, clarification_requested)
   * @param {string} referralId
   * @param {string} decision
   * @param {string} [note]
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async respond(referralId, decisionOrBody, noteOrUser, maybeUser) {
    let decision = decisionOrBody;
    let note = noteOrUser;
    let user = maybeUser;

    if (typeof decisionOrBody === 'object' && decisionOrBody !== null) {
      decision = decisionOrBody.decision || decisionOrBody.status;
      note = decisionOrBody.note || decisionOrBody.responseNote;
      user = noteOrUser;
    }

    const referral = await Referral.findById(referralId);
    if (!referral) {
      throw ApiError.notFound('Referral not found');
    }

    // Verify referral is in pending state
    if (referral.requestStatus !== 'pending') {
      throw ApiError.conflict(
        `Referral is not pending response (current status: '${referral.requestStatus}')`
      );
    }

    // Verify hospital scope: user's hospital must match referral's hospitalId
    const userHospitalId = (user.hospitalId?._id || user.hospitalId)?.toString();
    const referralHospitalId = referral.hospitalId.toString();

    if (user.role !== 'system_admin' && userHospitalId !== referralHospitalId) {
      throw ApiError.forbidden('You can only respond to referrals directed to your hospital');
    }

    const previousStatus = referral.requestStatus;
    const now = new Date();

    if (decision === 'accepted') {
      // Hospital must not be closed
      const hospital = await Hospital.findById(referral.hospitalId);
      if (!hospital || hospital.status === 'closed') {
        throw ApiError.conflict('Hospital is closed and cannot accept referrals');
      }

      // Check if case is already accepted elsewhere
      const existingAccepted = await Referral.findOne({
        caseId: referral.caseId,
        requestStatus: 'accepted',
        _id: { $ne: referral._id }
      });

      if (existingAccepted) {
        throw ApiError.conflict('Another referral has already been accepted for this case');
      }

      referral.requestStatus = 'accepted';
      referral.responseAt = now;
      referral.respondedBy = user._id || user.id;
      referral.responseNote = note || 'Referral accepted';
      await referral.save();

      // Auto-cancel all other pending/clarification referrals for same case
      await Referral.updateMany(
        {
          caseId: referral.caseId,
          _id: { $ne: referral._id },
          requestStatus: { $in: ['pending', 'clarification_requested'] }
        },
        {
          $set: {
            requestStatus: 'rejected',
            responseNote: 'Auto-cancelled: another hospital accepted',
            responseAt: now,
            respondedBy: user._id || user.id
          }
        }
      );

      // Update emergency status to 'destination_confirmed' with confirmed hospital
      const updatedEmergency = await Emergency.findOneAndUpdate(
        { caseId: referral.caseId },
        {
          $set: {
            status: 'destination_confirmed',
            confirmedHospitalId: referral.hospitalId
          },
          $inc: { version: 1 }
        },
        { new: true }
      );

      if (updatedEmergency) {
        emitEmergencyStatusUpdated(updatedEmergency);
      }
    } else if (decision === 'rejected') {
      referral.requestStatus = 'rejected';
      referral.responseAt = now;
      referral.respondedBy = user._id || user.id;
      referral.responseNote = note || 'Referral rejected';
      await referral.save();

      // Check if all referrals for this case are now rejected/expired
      const remainingActiveCount = await Referral.countDocuments({
        caseId: referral.caseId,
        requestStatus: { $in: ['pending', 'clarification_requested', 'accepted'] }
      });

      if (remainingActiveCount === 0) {
        // Return case status back to 'registered'
        const revertedEmergency = await Emergency.findOneAndUpdate(
          { caseId: referral.caseId, status: 'referral_pending' },
          {
            $set: { status: 'registered' },
            $inc: { version: 1 }
          },
          { new: true }
        );

        if (revertedEmergency) {
          emitEmergencyStatusUpdated(revertedEmergency);
        }
      }
    } else if (decision === 'clarification_requested') {
      referral.requestStatus = 'clarification_requested';
      referral.responseAt = now;
      referral.respondedBy = user._id || user.id;
      referral.responseNote = note || 'Clarification requested';
      await referral.save();
    }

    // Audit event
    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'referral_responded',
      recordType: 'Referral',
      recordId: referral._id,
      before: { requestStatus: previousStatus },
      after: {
        requestStatus: referral.requestStatus,
        responseNote: referral.responseNote,
        responseAt: referral.responseAt
      }
    });

    const populated = await Referral.findById(referral._id)
      .populate('hospitalId', 'name location contactPhone status specialties')
      .populate('requestedBy', 'name email role')
      .populate('respondedBy', 'name email role');

    emitReferralResponded(populated || referral);

    if (['accepted', 'rejected', 'clarification_requested'].includes(decision)) {
      try {
        await emailService.sendReferralDecision(populated || referral);
      } catch (error) {
        console.error('[EmailNotification] Referral response was saved, but requester email delivery failed.', {
          referralId: referral._id.toString(),
          requestStatus: referral.requestStatus,
          error: error.message
        });
      }
    }

    return populated || referral;
  }

  /**
   * Provide coordinator clarification on a referral awaiting clarification
   * @param {string} referralId
   * @param {string} note
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async clarify(referralId, note, user) {
    const referral = await Referral.findById(referralId);
    if (!referral) {
      throw ApiError.notFound('Referral not found');
    }

    if (referral.requestStatus !== 'clarification_requested') {
      throw ApiError.conflict(
        `Referral is not awaiting clarification (current status: '${referral.requestStatus}')`
      );
    }

    const previousNote = referral.responseNote || '';
    referral.requestStatus = 'pending';
    referral.responseNote = previousNote
      ? `${previousNote} | Coordinator Clarification: ${note}`
      : `Coordinator Clarification: ${note}`;
    await referral.save();

    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'referral_requested',
      recordType: 'Referral',
      recordId: referral._id,
      before: { requestStatus: 'clarification_requested', responseNote: previousNote },
      after: { requestStatus: 'pending', responseNote: referral.responseNote }
    });

    const populated = await Referral.findById(referral._id)
      .populate('hospitalId', 'name location contactPhone status specialties')
      .populate('requestedBy', 'name email role')
      .populate('respondedBy', 'name email role');

    emitReferralRequested(populated || referral);

    return populated || referral;
  }
}

module.exports = new ReferralService();
