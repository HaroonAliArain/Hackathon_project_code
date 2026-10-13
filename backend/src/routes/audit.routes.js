/**
 * @file audit.routes.js
 * @description Express router for queryable audit trail logs with RBAC enforcement.
 */

const express = require('express');
const auditController = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('coordinator', 'hospital_staff', 'hospital_admin', 'system_admin', 'observer'),
  auditController.list
);

module.exports = router;
