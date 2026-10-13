const resourceService = require('../services/resource.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * List all hospitals with real-time dynamic resource freshness calculations
 */
const listHospitals = asyncHandler(async (req, res) => {
  const hospitals = await resourceService.getHospitalsWithFreshness();
  return sendSuccess(res, hospitals, {}, 200);
});

const createHospital = asyncHandler(async (req, res) => {
  const hospital = await resourceService.createHospital(req.body, req.user);
  return sendSuccess(res, hospital, {}, 201);
});

/**
 * Get comprehensive resources and recent snapshot history for a specific hospital
 */
const getResources = asyncHandler(async (req, res) => {
  const resources = await resourceService.getHospitalResources(req.params.id);
  return sendSuccess(res, resources, {}, 200);
});

/**
 * Append new resource snapshots for a hospital
 */
const updateResources = asyncHandler(async (req, res) => {
  const { updates, verified } = req.body;
  const result = await resourceService.updateResources(req.params.id, updates, verified, req.user);
  return sendSuccess(res, result, {}, 200);
});

/**
 * Confirm current hospital resources with updated verification timestamp
 */
const confirmResources = asyncHandler(async (req, res) => {
  const result = await resourceService.confirmResources(req.params.id, req.user);
  return sendSuccess(res, result, {}, 200);
});

module.exports = {
  createHospital,
  listHospitals,
  getResources,
  updateResources,
  confirmResources
};
