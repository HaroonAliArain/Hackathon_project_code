/**
 * @file dashboard.controller.js
 * @description Controller handlers for real-time dashboard summary and analytics metrics.
 */

const analyticsService = require('../services/analytics.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const summary = asyncHandler(async (req, res) => {
  const data = await analyticsService.getDashboardSummary();
  return sendSuccess(res, data);
});

const metrics = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const data = await analyticsService.getMetrics(from, to);
  return sendSuccess(res, data);
});

module.exports = {
  summary,
  metrics
};
