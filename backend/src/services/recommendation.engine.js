/**
 * @file recommendation.engine.js
 * @description Pure multi-criteria recommendation scoring engine evaluating travel ETA, resource freshness, capacity, and clinical capability.
 */

const { RECOMMENDATION_WEIGHTS } = require('../config/constants');

const FRESHNESS_SCORES = {
  confirmed: 100,
  unconfirmed: 70,
  stale: 30,
  unknown: 10,
  unavailable: 0
};

/**
 * Clamp a number between min and max
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clamp = (val, min = 0, max = 100) => Math.min(Math.max(val, min), max);

/**
 * Run recommendation algorithm on case details and hospital candidate telemetry
 * @param {Object} input
 * @param {Object} input.case - Case with requiredResources, requiredSpecialties, pickupLocation
 * @param {Array<Object>} input.hospitals - Candidate hospital telemetry
 * @param {Object} [input.weights] - Component weights
 * @returns {{ eligible: Array<Object>, ineligible: Array<Object> }}
 */
function recommend(input) {
  if (!input || !input.case || !Array.isArray(input.hospitals)) {
    throw new Error('Invalid input to recommendation engine: case and hospitals array required');
  }

  const weights = {
    ...RECOMMENDATION_WEIGHTS,
    ...(input.weights || {})
  };

  const caseData = input.case;
  const requiredResources = Array.isArray(caseData.requiredResources) ? caseData.requiredResources : [];
  const requiredSpecialties = Array.isArray(caseData.requiredSpecialties) ? caseData.requiredSpecialties : [];

  const eligible = [];
  const ineligible = [];

  for (const hospital of input.hospitals) {
    const hospitalId = hospital.hospitalId || hospital._id;
    const hospitalName = hospital.name || 'Unknown Hospital';
    const hospitalResources = Array.isArray(hospital.resources) ? hospital.resources : [];
    const hospitalSpecialties = Array.isArray(hospital.specialties) ? hospital.specialties : [];
    const etaMinutes = typeof hospital.etaMinutes === 'number' ? hospital.etaMinutes : 30;

    // Build resource map for quick lookup
    const resourceMap = new Map();
    for (const r of hospitalResources) {
      if (r && r.resourceType) {
        resourceMap.set(r.resourceType, r);
      }
    }

    // 1. Eligibility Check
    const ineligibilityReasons = [];

    if (hospital.status === 'closed') {
      ineligibilityReasons.push('Hospital facility is currently closed');
    }

    for (const req of requiredResources) {
      const { resourceType, minCount = 1 } = req;
      const resData = resourceMap.get(resourceType);

      if (!resData || resData.availableCount === null || resData.availableCount === undefined) {
        ineligibilityReasons.push(`No reported availability for required resource '${resourceType}'`);
      } else if (resData.availableCount < minCount) {
        ineligibilityReasons.push(
          `Insufficient '${resourceType}': requires ${minCount}, available ${resData.availableCount}`
        );
      }
    }

    if (ineligibilityReasons.length > 0) {
      ineligible.push({
        hospitalId,
        hospitalName,
        reasons: ineligibilityReasons
      });
      continue;
    }

    // 2. Component Scoring (0 - 100)
    // Travel score: 100 - (etaMinutes / 60 * 100), clamped 0 - 100
    const travelScore = clamp(Math.round(100 - (etaMinutes / 60) * 100));

    // Freshness score: average score across all reported resources
    let totalFreshnessScore = 0;
    let resourceCount = 0;
    let hasStale = false;
    let hasUnknown = false;
    let allConfirmed = true;
    const warnings = [];

    for (const r of hospitalResources) {
      const status = r.status || 'unknown';
      const score = typeof FRESHNESS_SCORES[status] === 'number' ? FRESHNESS_SCORES[status] : 10;
      totalFreshnessScore += score;
      resourceCount++;

      if (status === 'stale') {
        hasStale = true;
        allConfirmed = false;
        warnings.push(
          `Resource '${r.resourceType}' status is stale (${r.ageMinutes || '?'} min since update)`
        );
      } else if (status === 'unknown') {
        hasUnknown = true;
        allConfirmed = false;
        warnings.push(`Resource '${r.resourceType}' status is unknown (no recent report)`);
      } else if (status !== 'confirmed') {
        allConfirmed = false;
      }
    }

    const freshnessScore = resourceCount > 0 ? clamp(Math.round(totalFreshnessScore / resourceCount)) : 50;

    let overallFreshnessStatus = 'unconfirmed';
    if (hasStale) {
      overallFreshnessStatus = 'stale';
    } else if (hasUnknown) {
      overallFreshnessStatus = 'unknown';
    } else if (allConfirmed && resourceCount > 0) {
      overallFreshnessStatus = 'confirmed';
    }

    // Capacity score: min(100, (availableCount / max(minCount, 1)) * 50) averaged over required resources
    let capacityScore = 100;
    if (requiredResources.length > 0) {
      let totalCapacity = 0;
      for (const req of requiredResources) {
        const { resourceType, minCount = 1 } = req;
        const resData = resourceMap.get(resourceType);
        const available = resData && typeof resData.availableCount === 'number' ? resData.availableCount : 0;
        const ratioScore = Math.min(100, (available / Math.max(minCount, 1)) * 50);
        totalCapacity += ratioScore;
      }
      capacityScore = clamp(Math.round(totalCapacity / requiredResources.length));
    }

    // Capability score: matched specialties percentage
    let capabilityScore = 100;
    let matchedSpecialtiesCount = 0;
    if (requiredSpecialties.length > 0) {
      const lowerHospitalSpecs = hospitalSpecialties.map((s) => s.toLowerCase());
      for (const reqSpec of requiredSpecialties) {
        if (lowerHospitalSpecs.includes(reqSpec.toLowerCase())) {
          matchedSpecialtiesCount++;
        }
      }
      capabilityScore = clamp(Math.round((matchedSpecialtiesCount / requiredSpecialties.length) * 100));
    }

    // 3. Final Weighted Score
    const finalScore = Number(
      (
        weights.travel * travelScore +
        weights.freshness * freshnessScore +
        weights.capacity * capacityScore +
        weights.capability * capabilityScore
      ).toFixed(2)
    );

    // 4. Human-readable explanation
    const explanation = [
      `Travel ETA: ${etaMinutes} mins (score: ${travelScore}/100)`,
      `Freshness: ${overallFreshnessStatus} (score: ${freshnessScore}/100)`,
      `Capacity: score ${capacityScore}/100 based on required resources`,
      `Capability: ${requiredSpecialties.length > 0 ? `${matchedSpecialtiesCount}/${requiredSpecialties.length} specialties matched` : 'All capabilities met'} (score: ${capabilityScore}/100)`
    ];

    eligible.push({
      hospitalId,
      hospitalName,
      score: finalScore,
      components: {
        travel: travelScore,
        freshness: freshnessScore,
        capacity: capacityScore,
        capability: capabilityScore
      },
      freshnessStatus: overallFreshnessStatus,
      etaMinutes,
      explanation,
      warnings
    });
  }

  // Sort eligible candidates by score descending
  eligible.sort((a, b) => b.score - a.score);

  return {
    eligible,
    ineligible
  };
}

module.exports = {
  recommend
};
