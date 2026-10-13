const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * Health check route
 * GET /api/v1/health
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    return sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  })
);

module.exports = router;
