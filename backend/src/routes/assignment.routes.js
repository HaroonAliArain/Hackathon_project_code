/**
 * @file assignment.routes.js
 * @description Express router for ambulance assignment endpoints with RBAC and validation.
 */

const express = require('express');
const assignmentController = require('../controllers/assignment.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  createAssignmentSchema,
  updateAssignmentStatusSchema
} = require('../validation/assignment.schema');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requireRole('coordinator', 'system_admin'),
  validate(createAssignmentSchema),
  assignmentController.create
);

router.get(
  '/',
  authenticate,
  assignmentController.list
);

router.patch(
  '/:id/status',
  authenticate,
  validate(updateAssignmentStatusSchema),
  assignmentController.updateStatus
);

module.exports = router;
