const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const Hospital = require('../models/Hospital');
const Ambulance = require('../models/Ambulance');
const { VALID_AMBULANCE_TRANSITIONS } = require('../config/constants');

/**
 * Service managing ambulance fleet state transitions and telemetry
 */
class AmbulanceService {
  /**
   * Register an ambulance in the operational fleet.
   * @param {Object} data
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async create(data, user) {
    if (data.baseHospitalId) {
      const hospital = await Hospital.findById(data.baseHospitalId);
      if (!hospital) {
        throw ApiError.notFound('Base hospital not found');
      }
    }

    const ambulance = await Ambulance.create({
      ...data,
      status: 'available',
      version: 1,
      lastUpdatedAt: new Date()
    });

    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'ambulance_created',
      recordType: 'Ambulance',
      recordId: ambulance._id,
      after: ambulance
    });

    return ambulance;
  }

  /**
   * Retrieve all ambulances with populated base hospital information
   * @returns {Promise<Array<Object>>}
   */
  async list() {
    return Ambulance.find().populate('baseHospitalId', 'name address contactPhone location');
  }

  /**
   * Update ambulance status and optional location with validation and concurrency checks
   * @param {string} ambulanceId - MongoDB _id or business ambulanceId
   * @param {string} newStatus - Target status
   * @param {Object} [location] - Location coordinates { lat, lng }
   * @param {Object} user - Authenticated user performing the update
   * @returns {Promise<Object>}
   */
  async updateStatus(ambulanceId, newStatus, location, user) {
    const isMongoId = mongoose.Types.ObjectId.isValid(ambulanceId);
    const query = isMongoId ? { $or: [{ _id: ambulanceId }, { ambulanceId }] } : { ambulanceId };

    const ambulance = await Ambulance.findOne(query);
    if (!ambulance) {
      throw ApiError.notFound('Ambulance not found');
    }

    // Role ownership check: ambulance_staff can only modify their own assigned ambulance
    if (user.role === 'ambulance_staff') {
      const userAmbulanceId = (user.ambulanceId?._id || user.ambulanceId)?.toString();
      const ambObjectIdStr = ambulance._id.toString();
      const ambBusinessIdStr = ambulance.ambulanceId ? ambulance.ambulanceId.toString() : '';

      if (!userAmbulanceId || (ambObjectIdStr !== userAmbulanceId && ambBusinessIdStr !== userAmbulanceId)) {
        throw ApiError.forbidden('Ambulance staff can only update their own assigned ambulance');
      }
    }

    // Validate state transition
    const currentStatus = ambulance.status;
    const allowedTransitions = VALID_AMBULANCE_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw ApiError.invalidTransition(currentStatus, newStatus);
    }

    // Build update fields
    const updateFields = {
      status: newStatus,
      lastUpdatedAt: new Date()
    };

    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      updateFields.lastKnownLocation = {
        lat: location.lat,
        lng: location.lng
      };
    }

    // Concurrency check via version increment
    const updateFilter = { _id: ambulance._id };
    if (typeof ambulance.version === 'number') {
      updateFilter.version = ambulance.version;
    }

    const updatedAmbulance = await Ambulance.findOneAndUpdate(
      updateFilter,
      {
        $set: updateFields,
        $inc: { version: 1 }
      },
      { new: true }
    );

    if (!updatedAmbulance) {
      throw ApiError.conflict('Ambulance was modified by another concurrent request. Please retry.');
    }

    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'ambulance_status_changed',
      recordType: 'Ambulance',
      recordId: updatedAmbulance._id,
      before: { status: currentStatus },
      after: {
        status: newStatus,
        ambulanceId: updatedAmbulance.ambulanceId,
        lastKnownLocation: location || null
      }
    });

    return updatedAmbulance;
  }
}

module.exports = new AmbulanceService();
