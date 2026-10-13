const ApiError = require('../utils/ApiError');
const envConfig = require('../config/env');
const { createAuditEvent } = require('../middleware/audit');
const Hospital = require('../models/Hospital');
const ResourceSnapshot = require('../models/ResourceSnapshot');
const { RESOURCE_TYPES } = require('../config/constants');

// Thresholds configured in env or defaults
const RESOURCE_STALE_AFTER = envConfig.RESOURCE_STALE_AFTER || 30; // minutes
const RESOURCE_CONFIRMED_MAX_AGE = envConfig.RESOURCE_CONFIRMED_MAX_AGE || 15; // minutes

/**
 * Normalization map for common plural variants to database schema types
 */
const resourceTypeMap = {
  icu_beds: 'icu_bed',
  ventilators: 'ventilator',
  general_beds: 'general_bed',
  operating_rooms: 'er_bed',
  oxygen_cylinders: 'ventilator',
  blood_units: 'blood_bank'
};

/**
 * Compute freshness at read time for a resource snapshot
 *
 * Evaluation:
 * 1. If no snapshot or availableCount === null -> 'unknown'
 * 2. If availableCount === 0 -> 'unavailable'
 * 3. If reportedAt older than RESOURCE_STALE_AFTER minutes -> 'stale'
 * 4. If verifiedAt exists and within RESOURCE_CONFIRMED_MAX_AGE minutes -> 'confirmed'
 * 5. Otherwise -> 'unconfirmed'
 *
 * Age calculation:
 * ageMinutes = (now - reportedAt) / 60000
 *
 * @param {Object|null} snapshot
 * @returns {{status: string, ageMinutes: number|null}}
 */
function computeFreshness(snapshot) {
  if (!snapshot || snapshot.availableCount === null || snapshot.availableCount === undefined) {
    return { status: 'unknown', ageMinutes: null };
  }

  const now = Date.now();
  const reportedTime = new Date(snapshot.reportedAt || snapshot.createdAt).getTime();
  const ageMinutes = Math.max(0, Math.round((now - reportedTime) / 60000));

  if (snapshot.availableCount === 0) {
    return { status: 'unavailable', ageMinutes };
  }

  if (ageMinutes > RESOURCE_STALE_AFTER) {
    return { status: 'stale', ageMinutes };
  }

  if (snapshot.verifiedAt) {
    const verifiedTime = new Date(snapshot.verifiedAt).getTime();
    const verifiedAgeMinutes = Math.max(0, Math.round((now - verifiedTime) / 60000));
    if (verifiedAgeMinutes <= RESOURCE_CONFIRMED_MAX_AGE) {
      return { status: 'confirmed', ageMinutes };
    }
  }

  return { status: 'unconfirmed', ageMinutes };
}

/**
 * Service managing hospital resources, append-only history, and read-time freshness
 */
class ResourceService {
  /**
   * Register a hospital facility.
   * @param {Object} data
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async createHospital(data, user) {
    const hospital = await Hospital.create({
      ...data,
      status: data.status || 'active'
    });

    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'hospital_created',
      recordType: 'Hospital',
      recordId: hospital._id,
      after: hospital
    });

    return hospital;
  }

  /**
   * Get all active hospitals with latest computed resource freshness and summary
   * @returns {Promise<Array<Object>>}
   */
  async getHospitalsWithFreshness() {
    const hospitals = await Hospital.find({ status: { $ne: 'closed' } }).lean();

    // Aggregate to fetch latest snapshot per hospital and resource type
    let latestSnapshots = [];
    try {
      latestSnapshots = await ResourceSnapshot.aggregate([
        { $sort: { reportedAt: -1 } },
        {
          $group: {
            _id: {
              hospitalId: '$hospitalId',
              resourceType: '$resourceType'
            },
            latestDoc: { $first: '$$ROOT' }
          }
        }
      ]);
    } catch {
      latestSnapshots = [];
    }

    const snapshotMap = new Map();
    for (const entry of latestSnapshots) {
      const hId = entry._id.hospitalId ? entry._id.hospitalId.toString() : '';
      const rType = entry._id.resourceType;
      snapshotMap.set(`${hId}_${rType}`, entry.latestDoc);
    }

    return hospitals.map((hospital) => {
      const hospitalIdStr = hospital._id.toString();
      const resources = {};
      const freshnessSummary = {
        confirmed: 0,
        unconfirmed: 0,
        stale: 0,
        unknown: 0,
        unavailable: 0
      };

      for (const type of RESOURCE_TYPES) {
        const snap = snapshotMap.get(`${hospitalIdStr}_${type}`) || null;
        const { status, ageMinutes } = computeFreshness(snap);

        freshnessSummary[status] = (freshnessSummary[status] || 0) + 1;

        resources[type] = {
          resourceType: type,
          availableCount: snap ? snap.availableCount : null,
          totalCapacity: snap ? snap.totalCapacity : null,
          status,
          ageMinutes,
          reportedAt: snap ? snap.reportedAt : null,
          verifiedAt: snap ? snap.verifiedAt : null
        };
      }

      return {
        ...hospital,
        resources,
        freshnessSummary
      };
    });
  }

  /**
   * Get detailed resources and past 5 snapshots history for a specific hospital
   * @param {string} hospitalId
   * @returns {Promise<Object>}
   */
  async getHospitalResources(hospitalId) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw ApiError.notFound('Hospital not found');
    }

    const resources = {};

    for (const type of RESOURCE_TYPES) {
      const history = await ResourceSnapshot.find({ hospitalId, resourceType: type })
        .sort({ reportedAt: -1 })
        .limit(5)
        .lean();

      const latest = history[0] || null;
      const { status, ageMinutes } = computeFreshness(latest);

      resources[type] = {
        resourceType: type,
        availableCount: latest ? latest.availableCount : null,
        totalCapacity: latest ? latest.totalCapacity : null,
        status, // Dynamic freshness
        reportedAt: latest ? latest.reportedAt : null,
        verifiedAt: latest ? latest.verifiedAt : null,
        reportedBy: latest ? latest.reportedBy : null,
        ageMinutes,
        history: history.map((h) => ({
          availableCount: h.availableCount,
          totalCapacity: h.totalCapacity,
          reportedAt: h.reportedAt,
          verifiedAt: h.verifiedAt,
          reportedBy: h.reportedBy
        }))
      };
    }

    return {
      hospitalId: hospital._id,
      hospitalName: hospital.name,
      resources
    };
  }

  /**
   * Append new resource snapshots (append-only) and record audit log
   * @param {string} hospitalId
   * @param {Array<Object>} updates
   * @param {boolean} verified
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async updateResources(hospitalId, updates, verified = false, user) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw ApiError.notFound('Hospital not found');
    }

    const now = new Date();
    const isVerified = Boolean(verified);

    // Map each update item to append-only snapshot doc
    const snapshotsToInsert = updates.map((u) => {
      const normalizedType = resourceTypeMap[u.resourceType] || u.resourceType;
      return {
        hospitalId,
        resourceType: normalizedType,
        availableCount: u.availableCount,
        totalCapacity: u.totalCapacity,
        reportedBy: user.id || user._id,
        reportedAt: now,
        verifiedAt: isVerified ? now : null
      };
    });

    await ResourceSnapshot.insertMany(snapshotsToInsert);

    // Record audit event for update
    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'resource_updated',
      recordType: 'Hospital',
      recordId: hospitalId,
      after: {
        hospitalName: hospital.name,
        updatesCount: updates.length,
        updates
      }
    });

    // Record audit event for verification if verified is true
    if (isVerified) {
      createAuditEvent({
        actorId: user.id || user._id,
        actorRole: user.role,
        eventType: 'resource_verified',
        recordType: 'Hospital',
        recordId: hospitalId,
        after: {
          hospitalName: hospital.name,
          verifiedAt: now,
          resourceTypes: updates.map((u) => u.resourceType)
        }
      });
    }

    return this.getHospitalResources(hospitalId);
  }

  /**
   * Re-confirm current resources by inserting new snapshots with verifiedAt set to now
   * @param {string} hospitalId
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async confirmResources(hospitalId, user) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      throw ApiError.notFound('Hospital not found');
    }

    const now = new Date();
    const newSnapshots = [];

    for (const type of RESOURCE_TYPES) {
      const latest = await ResourceSnapshot.findOne({ hospitalId, resourceType: type })
        .sort({ reportedAt: -1 })
        .lean();

      if (latest && latest.availableCount !== null && latest.availableCount !== undefined) {
        newSnapshots.push({
          hospitalId,
          resourceType: type,
          availableCount: latest.availableCount,
          totalCapacity: latest.totalCapacity,
          reportedBy: user.id || user._id,
          reportedAt: latest.reportedAt || now,
          verifiedAt: now
        });
      }
    }

    if (newSnapshots.length > 0) {
      await ResourceSnapshot.insertMany(newSnapshots);
    }

    createAuditEvent({
      actorId: user.id || user._id,
      actorRole: user.role,
      eventType: 'resource_verified',
      recordType: 'Hospital',
      recordId: hospitalId,
      after: {
        hospitalName: hospital.name,
        verifiedCount: newSnapshots.length,
      }
    });

    return this.getHospitalResources(hospitalId);
  }
}

const serviceInstance = new ResourceService();
serviceInstance.computeFreshness = computeFreshness;

module.exports = serviceInstance;
module.exports.computeFreshness = computeFreshness;
