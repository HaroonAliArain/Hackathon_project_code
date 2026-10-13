/**
 * @file sockets/emitter.js
 * @description Real-time WebSocket event emitters targeting role and case-specific rooms.
 */

const { getIO } = require('./index');

/**
 * Emit event when a new emergency is registered
 * @param {Object} emergency
 */
const emitEmergencyCreated = (emergency) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    id: emergency._id,
    caseId: emergency.caseId,
    status: emergency.status,
    priorityCategory: emergency.priorityCategory,
    timestamp: emergency.createdAt || new Date()
  };

  io.to('role:coordinator').emit('emergency:created', payload);
};

/**
 * Emit event when emergency lifecycle status changes
 * @param {Object} emergency
 */
const emitEmergencyStatusUpdated = (emergency) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    id: emergency._id,
    caseId: emergency.caseId,
    status: emergency.status,
    confirmedHospitalId: emergency.confirmedHospitalId ? emergency.confirmedHospitalId.toString() : null,
    timestamp: new Date()
  };

  io.to('role:coordinator').emit('emergency:status_updated', payload);

  if (emergency.caseId) {
    io.to(`case:${emergency.caseId}`).emit('emergency:status_updated', payload);
  }

  if (emergency.confirmedHospitalId) {
    const hospitalIdStr = emergency.confirmedHospitalId.toString();
    io.to(`hospital:${hospitalIdStr}`).emit('emergency:status_updated', payload);
  }
};

/**
 * Emit event when hospital resources are updated
 * @param {string} hospitalId
 * @param {Array<Object>|Object} resources
 */
const emitResourceUpdated = (hospitalId, resources) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    hospitalId: hospitalId.toString(),
    resources,
    timestamp: new Date()
  };

  io.to('role:coordinator').emit('resource:updated', payload);
  io.to(`hospital:${hospitalId.toString()}`).emit('resource:updated', payload);
};

/**
 * Emit event when a hospital resource becomes stale
 * @param {string} hospitalId
 * @param {Object} resource
 */
const emitResourceStale = (hospitalId, resource) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    hospitalId: hospitalId.toString(),
    resourceType: resource.resourceType,
    ageMinutes: resource.ageMinutes,
    status: resource.status || 'stale',
    timestamp: new Date()
  };

  io.to('role:coordinator').emit('resource:stale', payload);
  io.to(`hospital:${hospitalId.toString()}`).emit('resource:stale', payload);
};

/**
 * Emit event when a referral request is issued to a hospital
 * @param {Object} referral
 */
const emitReferralRequested = (referral) => {
  const io = getIO();
  if (!io) return;

  const hospitalIdStr = referral.hospitalId?._id
    ? referral.hospitalId._id.toString()
    : referral.hospitalId?.toString();

  const payload = {
    id: referral._id,
    caseId: referral.caseId,
    hospitalId: hospitalIdStr,
    requestStatus: referral.requestStatus,
    requestedAt: referral.requestedAt || new Date()
  };

  if (hospitalIdStr) {
    io.to(`hospital:${hospitalIdStr}`).emit('referral:requested', payload);
  }
  io.to('role:coordinator').emit('referral:requested', payload);
};

/**
 * Emit event when a hospital responds to a referral
 * @param {Object} referral
 */
const emitReferralResponded = (referral) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    id: referral._id,
    caseId: referral.caseId,
    hospitalId: referral.hospitalId?._id ? referral.hospitalId._id.toString() : referral.hospitalId?.toString(),
    requestStatus: referral.requestStatus,
    responseAt: referral.responseAt || new Date()
  };

  io.to('role:coordinator').emit('referral:responded', payload);

  if (referral.caseId) {
    io.to(`case:${referral.caseId}`).emit('referral:responded', payload);
  }
};

/**
 * Emit event when ambulance status or telemetry updates
 * @param {Object} ambulance
 */
const emitAmbulanceStatusUpdated = (ambulance) => {
  const io = getIO();
  if (!io) return;

  const ambulanceIdStr = ambulance.ambulanceId || ambulance._id.toString();
  const payload = {
    id: ambulance._id,
    ambulanceId: ambulance.ambulanceId,
    status: ambulance.status,
    lastKnownLocation: ambulance.lastKnownLocation || null,
    timestamp: new Date()
  };

  io.to('role:coordinator').emit('ambulance:status_updated', payload);
  io.to(`ambulance:${ambulanceIdStr}`).emit('ambulance:status_updated', payload);
};

/**
 * Emit event when offline sync conflict occurs
 * @param {Object} conflict
 */
const emitSyncConflict = (conflict) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    id: conflict._id,
    clientEventId: conflict.clientEventId,
    type: conflict.type,
    conflictStatus: conflict.conflictStatus || 'needs_review',
    timestamp: new Date()
  };

  io.to('role:coordinator').emit('sync:conflict', payload);
};

module.exports = {
  emitEmergencyCreated,
  emitEmergencyStatusUpdated,
  emitResourceUpdated,
  emitResourceStale,
  emitReferralRequested,
  emitReferralResponded,
  emitAmbulanceStatusUpdated,
  emitSyncConflict
};
