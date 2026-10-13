/**
 * @file sync.routes.js
 * @description Express router for offline data synchronization and conflict resolution endpoints.
 */

const express = require('express');
const syncController = require('../controllers/sync.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { syncEventsSchema, resolveConflictSchema } = require('../validation/sync.schema');

const router = express.Router();

router.post(
  '/events',
  authenticate,
  validate(syncEventsSchema),
  syncController.processEvents
);

router.get(
  '/conflicts',
  authenticate,
  requireRole('coordinator', 'hospital_staff', 'hospital_admin', 'system_admin'),
  syncController.getConflicts
);

router.post(
  '/conflicts/:id/resolve',
  authenticate,
  requireRole('coordinator', 'hospital_staff', 'hospital_admin', 'system_admin'),
  validate(resolveConflictSchema),
  syncController.resolveConflict
);

module.exports = router;
