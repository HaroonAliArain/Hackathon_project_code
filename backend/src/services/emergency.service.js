const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const Emergency = require('../models/Emergency');
const Assignment = require('../models/Assignment');
const Referral = require('../models/Referral');
const { VALID_EMERGENCY_TRANSITIONS } = require('../config/constants');

/**
 * Service managing emergency case registration, scoping, and transitions
 */
class EmergencyService {
  /**
   * Register a new emergency
   * @param {Object} data
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async create(data, user) {
    // Normalize priority categories if shorthand P1-P4 is passed
    const priorityMap = {
      P1: 'critical',
      p1: 'critical',
      P2: 'urgent',
      p2: 'urgent',
      P3: 'standard',
      p3: 'standard',
      P4: 'standard',
      p4: 'standard'
    };
    const priorityCategory = priorityMap[data.priorityCategory] || data.priorityCategory;

    // Normalize plural resource types to model-defined singular enums
    const resourceTypeMap = {
      icu_beds: 'icu_bed',
      ventilators: 'ventilator',
      general_beds: 'general_bed',
      operating_rooms: 'er_bed',
      oxygen_cylinders: 'ventilator',
      blood_units: 'blood_bank'
    };
    const requiredResources = (data.requiredResources || []).map((r) => ({
      resourceType: resourceTypeMap[r.resourceType] || r.resourceType,
      minCount: r.minCount || 1
    }));

    // Auto-generate caseId using model static generator
    let caseId;
    if (typeof Emergency.generateCaseId === 'function') {
      caseId = await Emergency.generateCaseId();
    } else {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      caseId = `EL-${datePart}-${randomPart}`;
    }

    const emergency = await Emergency.create({
      ...data,
      priorityCategory,
      requiredResources,
      caseId,
      createdBy: user.id || user._id,
      status: 'registered',
      version: 1
    });

    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'emergency_created',
      recordType: 'Emergency',
      recordId: emergency._id,
      after: {
        caseId: emergency.caseId,
        priorityCategory: emergency.priorityCategory,
        status: emergency.status
      }
    });

    return emergency;
  }

  /**
   * List emergencies with pagination and role-based access filtering
   * @param {Object} query
   * @param {Object} user
   * @returns {Promise<{emergencies: Array, total: number, page: number, pages: number}>}
   */
  async list(query = {}, user) {
    const filter = {};
    const userRole = user.role;

    // Apply role-based scoping
    if (['coordinator', 'system_admin', 'observer'].includes(userRole)) {
      // Full view allowed
    } else if (userRole === 'ambulance_staff') {
      const userAmbulanceId = user.ambulanceId?._id || user.ambulanceId;
      if (!userAmbulanceId) {
        return { emergencies: [], total: 0, page: 1, pages: 0 };
      }

      let caseIds = [];
      try {
        const assignments = await Assignment.find({
          ambulanceId: userAmbulanceId,
          status: { $nin: ['cancelled', 'rejected'] }
        }).select('caseId');
        caseIds = assignments.map((a) => a.caseId).filter(Boolean);
      } catch {
        caseIds = [];
      }

      filter.$or = [
        { caseId: { $in: caseIds } },
        { assignedAmbulanceId: userAmbulanceId }
      ];
    } else if (['hospital_staff', 'hospital_admin'].includes(userRole)) {
      const userHospitalId = user.hospitalId?._id || user.hospitalId;
      if (!userHospitalId) {
        return { emergencies: [], total: 0, page: 1, pages: 0 };
      }

      let caseIds = [];
      try {
        const referrals = await Referral.find({
          hospitalId: userHospitalId,
          requestStatus: { $nin: ['rejected', 'cancelled', 'expired'] }
        }).select('caseId');
        caseIds = referrals.map((r) => r.caseId).filter(Boolean);
      } catch {
        caseIds = [];
      }

      filter.$or = [
        { caseId: { $in: caseIds } },
        { confirmedHospitalId: userHospitalId }
      ];
    } else {
      throw ApiError.forbidden('Unauthorized role for accessing emergencies');
    }

    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [emergencies, total] = await Promise.all([
      Emergency.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Emergency.countDocuments(filter)
    ]);

    const pages = Math.ceil(total / limit) || (total > 0 ? 1 : 0);

    return {
      emergencies,
      total,
      page,
      pages
    };
  }

  /**
   * Get emergency by ID or caseId with scoping and populated relationships
   * @param {string} id
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async getById(id, user) {
    const isMongoId = mongoose.Types.ObjectId.isValid(id);
    const query = isMongoId ? { $or: [{ _id: id }, { caseId: id }] } : { caseId: id };
    const emergency = await Emergency.findOne(query);

    if (!emergency) {
      throw ApiError.notFound('Emergency not found');
    }

    const userRole = user.role;
    if (['coordinator', 'system_admin', 'observer'].includes(userRole)) {
      // Allowed
    } else if (userRole === 'ambulance_staff') {
      const userAmbulanceId = (user.ambulanceId?._id || user.ambulanceId)?.toString();
      let hasAssignment = false;
      try {
        hasAssignment = await Assignment.exists({
          caseId: emergency.caseId,
          ambulanceId: userAmbulanceId,
          status: { $nin: ['cancelled', 'rejected'] }
        });
      } catch {
        hasAssignment = false;
      }
      if (!hasAssignment) {
        throw ApiError.forbidden('You are not authorized to view this emergency');
      }
    } else if (['hospital_staff', 'hospital_admin'].includes(userRole)) {
      const userHospitalId = (user.hospitalId?._id || user.hospitalId)?.toString();
      const directHospital = emergency.confirmedHospitalId && emergency.confirmedHospitalId.toString() === userHospitalId;
      if (!directHospital) {
        let hasReferral = false;
        try {
          hasReferral = await Referral.exists({
            caseId: emergency.caseId,
            hospitalId: userHospitalId,
            requestStatus: { $nin: ['rejected', 'cancelled', 'expired'] }
          });
        } catch {
          hasReferral = false;
        }
        if (!hasReferral) {
          throw ApiError.forbidden('You are not authorized to view this emergency');
        }
      }
    } else {
      throw ApiError.forbidden('Access denied');
    }

    // Populate referrals and assignments
    let referrals = [];
    let assignments = [];
    try {
      [referrals, assignments] = await Promise.all([
        Referral.find({ caseId: emergency.caseId })
          .populate('hospitalId', 'name location contactPhone address')
          .sort({ createdAt: -1 }),
        Assignment.find({ caseId: emergency.caseId })
          .populate('ambulanceId', 'ambulanceId status baseHospitalId')
          .sort({ createdAt: -1 })
      ]);
    } catch {
      referrals = [];
      assignments = [];
    }

    const emergencyObj = emergency.toObject ? emergency.toObject() : { ...emergency };
    emergencyObj.referrals = referrals;
    emergencyObj.assignments = assignments;

    return emergencyObj;
  }

  /**
   * Update emergency state transition
   * @param {string} id
   * @param {string} newStatus
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async updateStatus(id, newStatus, user) {
    const isMongoId = mongoose.Types.ObjectId.isValid(id);
    const query = isMongoId ? { $or: [{ _id: id }, { caseId: id }] } : { caseId: id };
    const emergency = await Emergency.findOne(query);

    if (!emergency) {
      throw ApiError.notFound('Emergency not found');
    }

    const currentStatus = emergency.status;
    const allowedTransitions = VALID_EMERGENCY_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw ApiError.invalidTransition(currentStatus, newStatus);
    }

    // Role-specific constraints
    if (newStatus === 'cancelled' && !['coordinator', 'system_admin'].includes(user.role)) {
      throw ApiError.forbidden('Only coordinators can cancel an emergency');
    }

    if (user.role === 'ambulance_staff') {
      if (!['en_route', 'arrived'].includes(newStatus)) {
        throw ApiError.forbidden('Ambulance staff can only perform en_route and arrived transitions');
      }
      const userAmbulanceId = (user.ambulanceId?._id || user.ambulanceId)?.toString();
      const hasAssignment = await Assignment.exists({
        caseId: emergency.caseId,
        ambulanceId: userAmbulanceId,
        status: { $nin: ['cancelled', 'rejected'] }
      });
      if (!hasAssignment) {
        throw ApiError.forbidden('You are not authorized to update this emergency');
      }
    }

    if (user.role === 'hospital_staff') {
      if (newStatus !== 'handed_over') {
        throw ApiError.forbidden('Hospital staff can only perform handed_over transition');
      }
      const userHospitalId = (user.hospitalId?._id || user.hospitalId)?.toString();
      const isConfirmed = emergency.confirmedHospitalId && emergency.confirmedHospitalId.toString() === userHospitalId;
      if (!isConfirmed) {
        const hasReferral = await Referral.exists({
          caseId: emergency.caseId,
          hospitalId: userHospitalId,
          requestStatus: 'accepted'
        });
        if (!hasReferral) {
          throw ApiError.forbidden('You are not authorized to update this emergency');
        }
      }
    }

    // Optimistic concurrency check
    const updateFilter = { _id: emergency._id };
    if (typeof emergency.version === 'number') {
      updateFilter.version = emergency.version;
    }

    const updatedEmergency = await Emergency.findOneAndUpdate(
      updateFilter,
      {
        $set: { status: newStatus },
        $inc: { version: 1 }
      },
      { new: true }
    );

    if (!updatedEmergency) {
      throw ApiError.conflict('Emergency was modified by another concurrent request. Please refresh.');
    }

    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'emergency_status_changed',
      recordType: 'Emergency',
      recordId: updatedEmergency._id,
      before: { status: currentStatus },
      after: { status: newStatus, caseId: updatedEmergency.caseId }
    });

    return updatedEmergency;
  }
}

module.exports = new EmergencyService();
