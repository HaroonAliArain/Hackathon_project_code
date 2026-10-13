/**
 * @file recommendation.controller.js
 * @description Controller handlers for hospital recommendations.
 */

const recommendationService = require('../services/recommendation.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const getRecommendations = asyncHandler(async (req, res) => {
  const result = await recommendationService.getRecommendations(req.body.caseId, req.user);
  return sendSuccess(res, result);
});

module.exports = {
  getRecommendations
};
