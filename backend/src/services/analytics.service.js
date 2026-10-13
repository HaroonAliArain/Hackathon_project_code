/**
 * @file analytics.service.js
 * @description Analytics and real-time dashboard aggregation service for operational awareness.
 */

const Emergency = require('../models/Emergency');
const Referral = require('../models/Referral');
const Ambulance = require('../models/Ambulance');
const ResourceSnapshot = require('../models/ResourceSnapshot');
const SyncEvent = require('../models/SyncEvent');
const config = require('../config/env');
const { AMBULANCE_STATUSES, FRESHNESS_STATUSES, SYNC_STATUSES } = require('../config/constants');

/**
 * Compute freshness status for a resource snapshot
 * @param {Object|null} snapshot
 * @returns {string} Freshness status
 */
function computeSnapshotFreshness(snapshot) {
  if (!snapshot || snapshot.availableCount === null || snapshot.availableCount === undefined) {
    return 'unknown';
  }
  if (snapshot.availableCount === 0) {
    return 'unavailable';
  }

  const now = Date.now();
  const reportedTime = new Date(snapshot.reportedAt || snapshot.createdAt).getTime();
  const ageMinutes = Math.max(0, Math.round((now - reportedTime) / 60000));

  const staleAfter = config.RESOURCE_STALE_AFTER || 120;
  const confirmedMaxAge = config.RESOURCE_CONFIRMED_MAX_AGE || 30;

  if (ageMinutes > staleAfter) {
    return 'stale';
  }

  if (snapshot.verifiedAt) {
    const verifiedTime = new Date(snapshot.verifiedAt).getTime();
    const verifiedAgeMinutes = Math.max(0, Math.round((now - verifiedTime) / 60000));
    if (verifiedAgeMinutes <= confirmedMaxAge) {
      return 'confirmed';
    }
  }

  return 'unconfirmed';
}

class AnalyticsService {
  /**
   * Aggregate operational summary metrics for the real-time coordinator dashboard
   * @returns {Promise<Object>}
   */
  async getDashboardSummary() {
    // 1. Active cases (not closed or cancelled)
    const activeCases = await Emergency.countDocuments({
      status: { $nin: ['closed', 'cancelled'] }
    });

    // 2. Pending referrals
    const pendingReferrals = await Referral.countDocuments({
      requestStatus: 'pending'
    });

    // 3. Ambulance statuses breakdown
    const ambulanceCounts = await Ambulance.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const ambulanceStatuses = {};
    for (const s of AMBULANCE_STATUSES) {
      ambulanceStatuses[s] = 0;
    }
    for (const item of ambulanceCounts) {
      if (item._id) {
        ambulanceStatuses[item._id] = item.count;
      }
    }

    // 4. Resource freshness breakdown across all latest snapshots
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

    const freshnessBreakdown = {};
    for (const f of FRESHNESS_STATUSES) {
      freshnessBreakdown[f] = 0;
    }

    for (const item of latestSnapshots) {
      const snap = item.latestDoc;
      const status = computeSnapshotFreshness(snap);
      freshnessBreakdown[status] = (freshnessBreakdown[status] || 0) + 1;
    }

    // 5. Recent 10 emergencies
    const recentEmergencies = await Emergency.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('caseId status priorityCategory summary pickupLocation createdAt updatedAt')
      .lean();

    return {
      activeCases,
      pendingReferrals,
      ambulanceStatuses,
      freshnessBreakdown,
      recentEmergencies
    };
  }

  /**
   * Calculate detailed system performance metrics over a date range
   * @param {string|Date} [from]
   * @param {string|Date} [to]
   * @returns {Promise<Object>}
   */
  async getMetrics(from, to) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const dateFilter = {
      createdAt: { $gte: fromDate, $lte: toDate }
    };

    // 1. Referral response times
    const respondedReferrals = await Referral.find({
      requestedAt: { $gte: fromDate, $lte: toDate },
      responseAt: { $ne: null }
    }).select('requestedAt responseAt requestStatus caseId').lean();

    let totalReferralResponseSec = 0;
    let respondedCount = 0;

    for (const ref of respondedReferrals) {
      if (ref.requestedAt && ref.responseAt) {
        const diffSec = (new Date(ref.responseAt).getTime() - new Date(ref.requestedAt).getTime()) / 1000;
        if (diffSec >= 0) {
          totalReferralResponseSec += diffSec;
          respondedCount++;
        }
      }
    }

    const avgReferralResponseSeconds = respondedCount > 0
      ? Math.round(totalReferralResponseSec / respondedCount)
      : 0;

    // 2. Avg time to destination confirm for accepted referrals
    const acceptedReferrals = await Referral.find({
      requestStatus: 'accepted',
      responseAt: { $gte: fromDate, $lte: toDate }
    }).select('caseId responseAt').lean();

    let totalConfirmSec = 0;
    let confirmedCount = 0;

    for (const ref of acceptedReferrals) {
      const emergency = await Emergency.findOne({ caseId: ref.caseId }).select('createdAt').lean();
      if (emergency && emergency.createdAt && ref.responseAt) {
        const diff = (new Date(ref.responseAt).getTime() - new Date(emergency.createdAt).getTime()) / 1000;
        if (diff >= 0) {
          totalConfirmSec += diff;
          confirmedCount++;
        }
      }
    }

    const avgTimeToDestinationConfirmSeconds = confirmedCount > 0
      ? Math.round(totalConfirmSec / confirmedCount)
      : 0;

    // 3. Referral counts in range
    const pendingReferrals = await Referral.countDocuments({
      createdAt: { $gte: fromDate, $lte: toDate },
      requestStatus: 'pending'
    });

    const rejectedReferrals = await Referral.countDocuments({
      createdAt: { $gte: fromDate, $lte: toDate },
      requestStatus: 'rejected'
    });

    // 4. Resource freshness rate (% of latest snapshots confirmed)
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

    let confirmedSnapshots = 0;
    for (const item of latestSnapshots) {
      if (computeSnapshotFreshness(item.latestDoc) === 'confirmed') {
        confirmedSnapshots++;
      }
    }

    const resourceFreshnessRate = latestSnapshots.length > 0
      ? Number(((confirmedSnapshots / latestSnapshots.length) * 100).toFixed(1))
      : 0;

    // 5. Workflow completion rate (cases reaching handed_over or closed vs total created)
    const totalCreatedCases = await Emergency.countDocuments(dateFilter);
    const completedCases = await Emergency.countDocuments({
      ...dateFilter,
      status: { $in: ['handed_over', 'closed'] }
    });

    const workflowCompletionRate = totalCreatedCases > 0
      ? Number(((completedCases / totalCreatedCases) * 100).toFixed(1))
      : 0;

    // 6. Sync events summary
    const syncCounts = await SyncEvent.aggregate([
      {
        $match: {
          createdAt: { $gte: fromDate, $lte: toDate }
        }
      },
      {
        $group: {
          _id: '$syncStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const syncSummary = {};
    for (const s of SYNC_STATUSES) {
      syncSummary[s] = 0;
    }
    for (const item of syncCounts) {
      if (item._id) {
        syncSummary[item._id] = item.count;
      }
    }

    return {
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      },
      avgReferralResponseSeconds,
      avgTimeToDestinationConfirmSeconds,
      pendingReferrals,
      rejectedReferrals,
      resourceFreshnessRate,
      workflowCompletionRate,
      syncSummary,
      note: 'Computed from simulated data'
    };
  }
}

module.exports = new AnalyticsService();
