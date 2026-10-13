const emergencyService = require('../services/emergency.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * Register a new emergency
 */
const create = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.create(req.body, req.user);
  return sendSuccess(res, emergency, {}, 201);
});

/**
 * List emergencies with filters, pagination, and role-based scope
 */
const list = asyncHandler(async (req, res) => {
  const { emergencies, total, page, pages } = await emergencyService.list(req.query, req.user);
  return sendSuccess(res, emergencies, { total, page, pages }, 200);
});

/**
 * Get single emergency details by ID or caseId
 */
const getById = asyncHandler(async (req, res) => {
  const emergency = await emergencyService.getById(req.params.id, req.user);
  return sendSuccess(res, emergency, {}, 200);
});

/**
 * Update emergency status along state transition workflow
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const updatedEmergency = await emergencyService.updateStatus(req.params.id, status, req.user);
  return sendSuccess(res, updatedEmergency, {}, 200);
});

module.exports = {
  create,
  list,
  getById,
  updateStatus
};
