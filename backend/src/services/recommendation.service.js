/**
 * @file recommendation.service.js
 * @description Service orchestrating database telemetry, ETA calculations, and recommendation engine execution.
 */

const mongoose = require('mongoose');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const { RECOMMENDATION_WEIGHTS } = require('../config/constants');
const Emergency = require('../models/Emergency');
const Hospital = require('../models/Hospital');
const ResourceSnapshot = require('../models/ResourceSnapshot');
const { recommend } = require('./recommendation.engine');

/**
 * Calculate Haversine distance between two coordinates in kilometers
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Compute freshness status and age for a snapshot
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

  const staleAfter = config.RESOURCE_STALE_AFTER || 120;
  const confirmedMaxAge = config.RESOURCE_CONFIRMED_MAX_AGE || 30;

  if (snapshot.availableCount === 0) {
    return { status: 'unavailable', ageMinutes };
  }

  if (ageMinutes > staleAfter) {
    return { status: 'stale', ageMinutes };
  }

  if (snapshot.verifiedAt) {
    const verifiedTime = new Date(snapshot.verifiedAt).getTime();
    const verifiedAgeMinutes = Math.max(0, Math.round((now - verifiedTime) / 60000));
    if (verifiedAgeMinutes <= confirmedMaxAge) {
      return { status: 'confirmed', ageMinutes };
    }
  }

  return { status: 'unconfirmed', ageMinutes };
}

class RecommendationService {
  /**
   * Compute ranked hospital recommendations for an emergency case
   * @param {string} caseId
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async getRecommendations(caseId, user) {
    // 1. Load emergency case
    const isMongoId = mongoose.Types.ObjectId.isValid(caseId);
    const emergency = await Emergency.findOne(
      isMongoId ? { $or: [{ caseId }, { _id: caseId }] } : { caseId }
    );

    if (!emergency) {
      throw ApiError.notFound(`Emergency case '${caseId}' not found`);
    }

    // 2. Load active hospitals
    const hospitals = await Hospital.find({ status: { $ne: 'closed' } }).lean();
    if (!hospitals || hospitals.length === 0) {
      return {
        eligible: [],
        ineligible: [],
        disclaimer: 'Operational ranking only. Requires human review and hospital acceptance.'
      };
    }

    // 3. Retrieve latest snapshot per (hospitalId, resourceType)
    const hospitalIds = hospitals.map((h) => h._id);
    let latestSnapshots = [];
    try {
      latestSnapshots = await ResourceSnapshot.aggregate([
        { $match: { hospitalId: { $in: hospitalIds } } },
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
    } catch (err) {
      latestSnapshots = [];
    }

    // Snapshot lookup map
    const snapshotMap = new Map();
    for (const item of latestSnapshots) {
      const key = `${item._id.hospitalId.toString()}_${item._id.resourceType}`;
      snapshotMap.set(key, item.latestDoc);
    }

    // 4. Calculate ETA and format hospitals for the engine
    const avgSpeedKmH = 40; // 40 km/h average speed in urban traffic
    const pickupLat = emergency.pickupLocation?.lat || 0;
    const pickupLng = emergency.pickupLocation?.lng || 0;

    const formattedHospitals = hospitals.map((hospital) => {
      const hLat = hospital.location?.lat || pickupLat;
      const hLng = hospital.location?.lng || pickupLng;

      const distanceKm = haversineDistance(pickupLat, pickupLng, hLat, hLng);
      const etaMinutes = Math.max(1, Math.round((distanceKm / avgSpeedKmH) * 60));

      // Gather resource snapshots for this hospital
      const resources = [];
      const hospitalIdStr = hospital._id.toString();

      // Get all known resource types from latest snapshots or emergency requirements
      const relevantTypes = new Set(
        (emergency.requiredResources || []).map((r) => r.resourceType)
      );

      for (const item of latestSnapshots) {
        if (item._id.hospitalId.toString() === hospitalIdStr) {
          relevantTypes.add(item._id.resourceType);
        }
      }

      for (const rType of relevantTypes) {
        const snap = snapshotMap.get(`${hospitalIdStr}_${rType}`) || null;
        const { status, ageMinutes } = computeFreshness(snap);
        resources.push({
          resourceType: rType,
          availableCount: snap ? snap.availableCount : null,
          totalCapacity: snap ? snap.totalCapacity : null,
          status,
          ageMinutes
        });
      }

      return {
        hospitalId: hospital._id,
        name: hospital.name,
        status: hospital.status,
        specialties: hospital.specialties || [],
        location: hospital.location,
        etaMinutes,
        resources
      };
    });

    // 5. Build engine input payload
    const engineInput = {
      case: {
        caseId: emergency.caseId,
        requiredResources: emergency.requiredResources || [],
        requiredSpecialties: emergency.requiredSpecialties || [],
        pickupLocation: emergency.pickupLocation
      },
      hospitals: formattedHospitals,
      weights: RECOMMENDATION_WEIGHTS
    };

    // 6. Invoke recommendation engine
    let recommendationResult;
    try {
      if (config.RECOMMENDATION_MODE === 'http' && config.RECOMMENDATION_SERVICE_URL) {
        // HTTP external mode with fallback
        try {
          const res = await fetch(`${config.RECOMMENDATION_SERVICE_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(engineInput),
            signal: AbortSignal.timeout(5000)
          });
          if (res.ok) {
            recommendationResult = await res.json();
          } else {
            recommendationResult = recommend(engineInput);
          }
        } catch {
          recommendationResult = recommend(engineInput);
        }
      } else {
        recommendationResult = recommend(engineInput);
      }
    } catch (err) {
      throw new ApiError(502, 'RECOMMENDATION_UNAVAILABLE', 'Recommendation service is temporarily unavailable');
    }

    if (!recommendationResult || !Array.isArray(recommendationResult.eligible)) {
      throw new ApiError(502, 'RECOMMENDATION_UNAVAILABLE', 'Invalid recommendation engine response');
    }

    // 7. Audit log
    createAuditEvent({
      actorId: user._id || user.id,
      actorRole: user.role,
      eventType: 'recommendation_requested',
      recordType: 'Emergency',
      recordId: emergency.caseId,
      details: {
        eligibleCount: recommendationResult.eligible.length,
        ineligibleCount: (recommendationResult.ineligible || []).length
      }
    });

    return {
      caseId: emergency.caseId,
      eligible: recommendationResult.eligible,
      ineligible: recommendationResult.ineligible || [],
      disclaimer: 'Operational ranking only. Requires human review and hospital acceptance.'
    };
  }
}

module.exports = new RecommendationService();
