/**
 * @file analytics.routes.js
 * @description Express router for historical performance analytics and SLA metrics.
 */

const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('coordinator', 'system_admin', 'observer'),
  dashboardController.metrics
);

router.get(
  '/metrics',
  authenticate,
  requireRole('coordinator', 'system_admin', 'observer'),
  dashboardController.metrics
);

module.exports = router;
