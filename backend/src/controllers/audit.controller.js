/**
 * @file audit.controller.js
 * @description Controller for querying immutable audit trail logs with strict role-based access scoping.
 */

const AuditEvent = require('../models/AuditEvent');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const { user } = req;
  const { recordType, recordId, eventType, from, to } = req.query;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {};

  // Date range filters
  if (from || to) {
    query.timestamp = {};
    if (from) {
      query.timestamp.$gte = new Date(from);
    }
    if (to) {
      query.timestamp.$lte = new Date(to);
    }
  }

  if (recordType) {
    query.recordType = recordType;
  }
  if (recordId) {
    query.recordId = recordId;
  }
  if (eventType) {
    query.eventType = eventType;
  }

  // Scoping rules based on role
  if (['system_admin', 'observer'].includes(user.role)) {
    // Unrestricted audit visibility
  } else if (user.role === 'coordinator') {
    // Coordinators see operational events, but cannot inspect user auth changes
    query.eventType = {
      $nin: ['user_created', 'user_updated', 'login_failed']
    };
    if (eventType && !['user_created', 'user_updated', 'login_failed'].includes(eventType)) {
      query.eventType = eventType;
    }
  } else if (['hospital_staff', 'hospital_admin'].includes(user.role)) {
    // Hospital staff only see events concerning their assigned facility
    if (!user.hospitalId) {
      throw ApiError.forbidden('No assigned hospital for user audit scope');
    }
    const userHospitalId = user.hospitalId.toString();

    query.$or = [
      { recordType: 'Hospital', recordId: userHospitalId },
      { 'after.hospitalId': userHospitalId },
      { 'details.hospitalId': userHospitalId },
      { actorId: user._id }
    ];
  } else {
    // Default fallback: users only see actions where they were the actor
    query.actorId = user._id;
  }

  const [total, events] = await Promise.all([
    AuditEvent.countDocuments(query),
    AuditEvent.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'name email role')
      .lean()
  ]);

  const meta = {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };

  return sendSuccess(res, events, meta);
});

module.exports = {
  list
};
