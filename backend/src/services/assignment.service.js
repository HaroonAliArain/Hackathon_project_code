/**
 * @file assignment.service.js
 * @description Core business logic for ambulance dispatch assignments and state transitions.
 */

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const { VALID_ASSIGNMENT_TRANSITIONS } = require('../config/constants');
const Assignment = require('../models/Assignment');
const Emergency = require('../models/Emergency');
const Ambulance = require('../models/Ambulance');
const { emitEmergencyStatusUpdated, emitAmbulanceStatusUpdated } = require('../sockets/emitter');

class AssignmentService {
  /**
   * Dispatch an available ambulance to a case with a confirmed hospital destination
   * @param {Object} data - { caseId, ambulanceId }
   * @param {Object} user - Authenticated coordinator / admin
   * @returns {Promise<Object>}
   */
  async create(data, user) {
    const { caseId, ambulanceId } = data;

    // Load emergency case
    const isMongoId = mongoose.Types.ObjectId.isValid(caseId);
    const emergency = await Emergency.findOne(
      isMongoId ? { $or: [{ caseId }, { _id: caseId }] } : { caseId }
    );

    if (!emergency) {
      throw ApiError.notFound(`Emergency case '${caseId}' not found`);
    }

    // Verify case status has confirmed destination
    if (emergency.status !== 'destination_confirmed' || !emergency.confirmedHospitalId) {
      throw ApiError.conflict('Case must have a confirmed destination before ambulance assignment');
    }

    // Load ambulance by _id or business ambulanceId
    const isAmbMongoId = mongoose.Types.ObjectId.isValid(ambulanceId);
    const ambulance = await Ambulance.findOne(
      isAmbMongoId ? { $or: [{ _id: ambulanceId }, { ambulanceId }] } : { ambulanceId }
    );

    if (!ambulance) {
      throw ApiError.notFound(`Ambulance '${ambulanceId}' not found`);
    }

    if (ambulance.status !== 'available') {
      throw ApiError.conflict(`Ambulance is not available (current status: '${ambulance.status}')`);
    }

    // Create assignment
    const assignment = await Assignment.create({
      caseId: emergency.caseId,
      ambulanceId: ambulance._id,
      destinationHospitalId: emergency.confirmedHospitalId,
      status: 'assigned',
      assignedBy: user._id || user.id,
      timestamps: {
        assignedAt: new Date()
      }
    });

    // Update ambulance status to 'assigned'
    ambulance.status = 'assigned';
    ambulance.version = (ambulance.version || 1) + 1;
    ambulance.lastUpdatedAt = new Date();
    await ambulance.save();

    // Update emergency status to 'ambulance_assigned'
    emergency.status = 'ambulance_assigned';
    emergency.version = (emergency.version || 1) + 1;
    await emergency.save();

    // Audit trail
    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'assignment_created',
      recordType: 'Assignment',
      recordId: assignment._id,
      after: assignment
    });

    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'ambulance_assigned',
      recordType: 'Ambulance',
      recordId: ambulance._id,
      after: {
        status: 'assigned',
        caseId: emergency.caseId,
        destinationHospitalId: emergency.confirmedHospitalId
      }
    });

    emitEmergencyStatusUpdated(emergency);
    emitAmbulanceStatusUpdated(ambulance);

    const populated = await Assignment.findById(assignment._id)
      .populate('ambulanceId', 'ambulanceId status lastKnownLocation')
      .populate('destinationHospitalId', 'name location contactPhone status')
      .populate('assignedBy', 'name email role');

    return populated || assignment;
  }

  /**
   * Update assignment status through valid lifecycle transitions
   * @param {string} assignmentId
   * @param {string} newStatus
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async updateStatus(assignmentId, newStatusOrBody, maybeUser) {
    let newStatus = newStatusOrBody;
    let user = maybeUser;

    if (typeof newStatusOrBody === 'object' && newStatusOrBody !== null) {
      newStatus = newStatusOrBody.status;
      user = maybeUser;
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      throw ApiError.notFound('Assignment not found');
    }

    const currentStatus = assignment.status;
    const allowed = VALID_ASSIGNMENT_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw ApiError.invalidTransition(currentStatus, newStatus);
    }

    // Role check: ambulance_staff can update assignment for their ambulance
    if (user.role === 'ambulance_staff') {
      const userAmbulanceId = (user.ambulanceId?._id || user.ambulanceId)?.toString();
      const assignmentAmbulanceId = assignment.ambulanceId.toString();
      if (userAmbulanceId && userAmbulanceId !== assignmentAmbulanceId) {
        throw ApiError.forbidden('You can only update assignments for your assigned ambulance');
      }
    }

    const now = new Date();
    assignment.status = newStatus;

    if (!assignment.timestamps) {
      assignment.timestamps = {};
    }

    if (newStatus === 'en_route') {
      assignment.timestamps.enRouteAt = now;
    } else if (newStatus === 'arrived') {
      assignment.timestamps.arrivedAt = now;
    } else if (newStatus === 'handed_over') {
      assignment.timestamps.handedOverAt = now;
    }

    await assignment.save();

    // Map assignment status to corresponding ambulance and emergency statuses
    let targetAmbulanceStatus = newStatus;
    let targetEmergencyStatus = newStatus;

    if (newStatus === 'handed_over') {
      targetAmbulanceStatus = 'available'; // Ambulance becomes available again upon handover
      targetEmergencyStatus = 'handed_over';
    }

    // Update ambulance
    const updatedAmbulance = await Ambulance.findByIdAndUpdate(
      assignment.ambulanceId,
      {
        $set: {
          status: targetAmbulanceStatus,
          lastUpdatedAt: now
        },
        $inc: { version: 1 }
      },
      { new: true }
    );

    // Update emergency
    const updatedEmergency = await Emergency.findOneAndUpdate(
      { caseId: assignment.caseId },
      {
        $set: {
          status: targetEmergencyStatus,
          lastUpdatedAt: now
        },
        $inc: { version: 1 }
      },
      { new: true }
    );

    // Audit assignment status change
    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'assignment_status_changed',
      recordType: 'Assignment',
      recordId: assignment._id,
      before: { status: currentStatus },
      after: { status: newStatus, timestamps: assignment.timestamps }
    });

    if (updatedEmergency) {
      emitEmergencyStatusUpdated(updatedEmergency);
    }
    if (updatedAmbulance) {
      emitAmbulanceStatusUpdated(updatedAmbulance);
    }

    const populated = await Assignment.findById(assignment._id)
      .populate('ambulanceId', 'ambulanceId status lastKnownLocation')
      .populate('destinationHospitalId', 'name location contactPhone status')
      .populate('assignedBy', 'name email role');

    return populated || assignment;
  }

  /**
   * List assignments with filtering and population
   * @param {Object} user
   * @param {Object} [filters={}]
   * @returns {Promise<Array<Object>>}
   */
  async list(user, filters = {}) {
    const query = {};

    if (filters.caseId) {
      query.caseId = filters.caseId;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.ambulanceId) {
      query.ambulanceId = filters.ambulanceId;
    }

    if (['hospital_staff', 'hospital_admin'].includes(user.role) && user.hospitalId) {
      query.destinationHospitalId = user.hospitalId;
    }

    if (user.role === 'ambulance_staff' && user.ambulanceId) {
      query.ambulanceId = user.ambulanceId;
    }

    return Assignment.find(query)
      .populate('ambulanceId', 'ambulanceId status lastKnownLocation')
      .populate('destinationHospitalId', 'name location contactPhone status')
      .populate('assignedBy', 'name email role')
      .sort({ createdAt: -1 });
  }
}

module.exports = new AssignmentService();
