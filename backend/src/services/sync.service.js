/**
 * @file sync.service.js
 * @description Offline sync engine handling idempotent batch ingestion, version conflict detection, and resolution.
 */

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const SyncEvent = require('../models/SyncEvent');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const Emergency = require('../models/Emergency');
const ambulanceService = require('./ambulance.service');
const resourceService = require('./resource.service');
const emergencyService = require('./emergency.service');
const { emitSyncConflict } = require('../sockets/emitter');

class SyncService {
  /**
   * Process a batch of offline-queued sync events with conflict detection
   * @param {Array<Object>} events - Array of sync event payloads
   * @param {Object} user - Authenticated user submitting the sync
   * @returns {Promise<Array<Object>>}
   */
  async processEvents(events, user) {
    // Sort events by clientTimestamp to process in chronological order
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime()
    );

    const results = [];

    for (const event of sortedEvents) {
      const { clientEventId, type, payload, baseVersion, clientTimestamp } = event;

      // 1. Idempotency Check: check if clientEventId already processed
      const existing = await SyncEvent.findOne({ clientEventId });
      if (existing) {
        results.push({
          clientEventId,
          status: 'duplicate',
          syncStatus: existing.syncStatus,
          conflictStatus: existing.conflictStatus
        });
        continue;
      }

      // 2. Re-check Authorization for the event type
      let isAuthorized = false;
      if (type === 'ambulance.status.update') {
        isAuthorized = ['ambulance_staff', 'coordinator', 'system_admin'].includes(user.role);
      } else if (type === 'resource.update') {
        isAuthorized = ['hospital_staff', 'hospital_admin', 'coordinator', 'system_admin'].includes(user.role);
      } else if (type === 'emergency.create') {
        isAuthorized = ['coordinator', 'system_admin'].includes(user.role);
      }

      if (!isAuthorized) {
        const rejectedEvent = await SyncEvent.create({
          clientEventId,
          userId: user._id || user.id,
          type,
          payload,
          baseVersion: baseVersion ?? null,
          clientTimestamp: new Date(clientTimestamp),
          syncStatus: 'rejected',
          conflictStatus: 'none',
          rejectionReason: `Role '${user.role}' is not authorized for event type '${type}'`
        });

        results.push({
          clientEventId,
          status: 'rejected',
          reason: rejectedEvent.rejectionReason
        });
        continue;
      }

      // 3. Payload Validation & Conflict Detection
      let conflictDetected = false;
      let conflictReason = null;

      if (type === 'ambulance.status.update') {
        if (!payload || !payload.ambulanceId || !payload.status) {
          const rejected = await SyncEvent.create({
            clientEventId,
            userId: user._id || user.id,
            type,
            payload,
            baseVersion: baseVersion ?? null,
            clientTimestamp: new Date(clientTimestamp),
            syncStatus: 'rejected',
            conflictStatus: 'none',
            rejectionReason: 'Payload missing ambulanceId or status'
          });
          results.push({ clientEventId, status: 'rejected', reason: rejected.rejectionReason });
          continue;
        }

        const isAmbMongoId = mongoose.Types.ObjectId.isValid(payload.ambulanceId);
        const ambulance = await Ambulance.findOne(
          isAmbMongoId
            ? { $or: [{ _id: payload.ambulanceId }, { ambulanceId: payload.ambulanceId }] }
            : { ambulanceId: payload.ambulanceId }
        );

        if (!ambulance) {
          const rejected = await SyncEvent.create({
            clientEventId,
            userId: user._id || user.id,
            type,
            payload,
            baseVersion: baseVersion ?? null,
            clientTimestamp: new Date(clientTimestamp),
            syncStatus: 'rejected',
            conflictStatus: 'none',
            rejectionReason: `Ambulance '${payload.ambulanceId}' not found`
          });
          results.push({ clientEventId, status: 'rejected', reason: rejected.rejectionReason });
          continue;
        }

        // Version conflict check: if baseVersion was provided and differs from server version
        if (
          baseVersion !== undefined &&
          baseVersion !== null &&
          typeof ambulance.version === 'number' &&
          ambulance.version !== baseVersion
        ) {
          conflictDetected = true;
          conflictReason = `Version mismatch: client baseVersion was ${baseVersion}, current server version is ${ambulance.version}`;
        }
      } else if (type === 'resource.update') {
        if (!payload || !payload.hospitalId || !Array.isArray(payload.updates)) {
          const rejected = await SyncEvent.create({
            clientEventId,
            userId: user._id || user.id,
            type,
            payload,
            baseVersion: baseVersion ?? null,
            clientTimestamp: new Date(clientTimestamp),
            syncStatus: 'rejected',
            conflictStatus: 'none',
            rejectionReason: 'Payload missing hospitalId or updates array'
          });
          results.push({ clientEventId, status: 'rejected', reason: rejected.rejectionReason });
          continue;
        }
      } else if (type === 'emergency.create') {
        if (!payload || !payload.priorityCategory || !payload.pickupLocation) {
          const rejected = await SyncEvent.create({
            clientEventId,
            userId: user._id || user.id,
            type,
            payload,
            baseVersion: baseVersion ?? null,
            clientTimestamp: new Date(clientTimestamp),
            syncStatus: 'rejected',
            conflictStatus: 'none',
            rejectionReason: 'Payload missing priorityCategory or pickupLocation'
          });
          results.push({ clientEventId, status: 'rejected', reason: rejected.rejectionReason });
          continue;
        }
      }

      // 4. If conflict detected, save SyncEvent as conflict for manual/coordinator review
      if (conflictDetected) {
        const conflictEvent = await SyncEvent.create({
          clientEventId,
          userId: user._id || user.id,
          type,
          payload,
          baseVersion: baseVersion ?? null,
          clientTimestamp: new Date(clientTimestamp),
          syncStatus: 'conflict',
          conflictStatus: 'needs_review',
          rejectionReason: conflictReason
        });

        // Audit sync conflict
        createAuditEvent({
          actorId: user._id || user.id,
          actorRole: user.role,
          eventType: 'sync_conflict_created',
          recordType: 'SyncEvent',
          recordId: conflictEvent._id,
          source: 'offline-sync',
          after: conflictEvent
        });

        emitSyncConflict(conflictEvent);

        results.push({
          clientEventId,
          status: 'conflict',
          conflictId: conflictEvent._id,
          reason: conflictReason
        });
        continue;
      }

      // 5. Apply the change via corresponding business service
      try {
        let appliedResult = null;

        if (type === 'ambulance.status.update') {
          appliedResult = await ambulanceService.updateStatus(
            payload.ambulanceId,
            payload.status,
            payload.location,
            user
          );
        } else if (type === 'resource.update') {
          appliedResult = await resourceService.updateResources(
            payload.hospitalId,
            payload.updates,
            payload.verified || false,
            user
          );
        } else if (type === 'emergency.create') {
          appliedResult = await emergencyService.create(payload, user);
        }

        // 6. Record applied SyncEvent
        const syncEvent = await SyncEvent.create({
          clientEventId,
          userId: user._id || user.id,
          type,
          payload,
          baseVersion: baseVersion ?? null,
          clientTimestamp: new Date(clientTimestamp),
          syncStatus: 'applied',
          conflictStatus: 'none'
        });

        results.push({
          clientEventId,
          status: 'applied',
          syncEventId: syncEvent._id,
          data: appliedResult
        });
      } catch (applyError) {
        const rejected = await SyncEvent.create({
          clientEventId,
          userId: user._id || user.id,
          type,
          payload,
          baseVersion: baseVersion ?? null,
          clientTimestamp: new Date(clientTimestamp),
          syncStatus: 'rejected',
          conflictStatus: 'none',
          rejectionReason: applyError.message
        });

        results.push({
          clientEventId,
          status: 'rejected',
          reason: applyError.message
        });
      }
    }

    return results;
  }

  /**
   * Retrieve pending conflict records requiring human coordinator or admin review
   * @param {Object} user - Authenticated user
   * @returns {Promise<Array<Object>>}
   */
  async getConflicts(user) {
    const query = { conflictStatus: 'needs_review' };

    if (['hospital_staff', 'hospital_admin'].includes(user.role)) {
      if (!user.hospitalId) {
        throw ApiError.forbidden('No assigned hospital for user conflict scope');
      }
      query.$or = [
        { 'payload.hospitalId': user.hospitalId.toString() },
        { userId: user._id || user.id }
      ];
    } else if (user.role === 'ambulance_staff') {
      query.userId = user._id || user.id;
    }

    return SyncEvent.find(query)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });
  }

  /**
   * Resolve an offline synchronization conflict
   * @param {string} conflictId - MongoDB _id of the SyncEvent
   * @param {string} resolution - 'accept_client' | 'keep_server' | 'manual'
   * @param {string} [note] - Resolution note
   * @param {Object} user - Authenticated user performing the resolution
   * @returns {Promise<Object>}
   */
  async resolveConflict(conflictId, resolution, note, user) {
    const syncEvent = await SyncEvent.findById(conflictId);
    if (!syncEvent) {
      throw ApiError.notFound('Sync conflict event not found');
    }

    if (syncEvent.conflictStatus !== 'needs_review') {
      throw ApiError.conflict(`Conflict is already resolved (status: '${syncEvent.conflictStatus}')`);
    }

    const { type, payload } = syncEvent;

    // Apply client changes if accept_client
    if (resolution === 'accept_client') {
      if (type === 'ambulance.status.update') {
        await ambulanceService.updateStatus(
          payload.ambulanceId,
          payload.status,
          payload.location,
          user
        );
      } else if (type === 'resource.update') {
        await resourceService.updateResources(
          payload.hospitalId,
          payload.updates,
          payload.verified || false,
          user
        );
      } else if (type === 'emergency.create') {
        await emergencyService.create(payload, user);
      }
      syncEvent.syncStatus = 'applied';
    } else if (resolution === 'keep_server') {
      // Retain current server state without re-applying client changes
      syncEvent.syncStatus = 'rejected';
      syncEvent.rejectionReason = `Server state retained: ${note || 'Manually decided to discard client change'}`;
    } else if (resolution === 'manual') {
      // Manual resolution
      syncEvent.syncStatus = 'applied';
    }

    syncEvent.conflictStatus = 'resolved';
    syncEvent.resolution = {
      decision: resolution,
      note: note || '',
      resolvedBy: user._id || user.id,
      resolvedAt: new Date()
    };

    await syncEvent.save();

    // Audit conflict resolution
    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'sync_conflict_resolved',
      recordType: 'SyncEvent',
      recordId: syncEvent._id,
      after: {
        resolution,
        note,
        conflictStatus: 'resolved',
        syncStatus: syncEvent.syncStatus
      }
    });

    return syncEvent;
  }
}

module.exports = new SyncService();
