const ambulanceService = require('../services/ambulance.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * List all ambulances
 */
const list = asyncHandler(async (req, res) => {
  const ambulances = await ambulanceService.list();
  return sendSuccess(res, ambulances, {}, 200);
});

const create = asyncHandler(async (req, res) => {
  const ambulance = await ambulanceService.create(req.body, req.user);
  return sendSuccess(res, ambulance, {}, 201);
});

/**
 * Update status and location of an ambulance
 * Verifies ambulance_staff scope
 */
const updateStatus = asyncHandler(async (req, res) => {
  const ambulanceId = req.params.id;
  const { status, lastKnownLocation } = req.body;

  // Ambulance staff scope check
  if (req.user.role === 'ambulance_staff') {
    const userAmbulanceId = (req.user.ambulanceId?._id || req.user.ambulanceId)?.toString();
    if (!userAmbulanceId) {
      throw ApiError.forbidden('Ambulance staff is not assigned to any ambulance');
    }
  }

  const updatedAmbulance = await ambulanceService.updateStatus(
    ambulanceId,
    status,
    lastKnownLocation,
    req.user
  );

  return sendSuccess(res, updatedAmbulance, {}, 200);
});

module.exports = {
  create,
  list,
  updateStatus
};
