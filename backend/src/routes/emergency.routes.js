const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergency.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { createEmergencySchema, updateStatusSchema } = require('../validation/emergency.schema');

/**
 * @route   POST /api/emergencies
 * @desc    Register a new emergency case
 * @access  Private (coordinator, ambulance_staff, system_admin)
 */
router.post(
  '/',
  authenticate,
  requireRole('coordinator', 'ambulance_staff', 'system_admin'),
  validate(createEmergencySchema),
  emergencyController.create
);

/**
 * @route   GET /api/emergencies
 * @desc    List emergencies scoped to the caller's role
 * @access  Private (Authenticated)
 */
router.get('/', authenticate, emergencyController.list);

/**
 * @route   GET /api/emergencies/:id
 * @desc    Get emergency case details by id or caseId
 * @access  Private (Authenticated)
 */
router.get('/:id', authenticate, emergencyController.getById);

/**
 * @route   PATCH /api/emergencies/:id/status
 * @desc    Update status of an emergency case
 * @access  Private (Authenticated)
 */
router.patch(
  '/:id/status',
  authenticate,
  validate(updateStatusSchema),
  emergencyController.updateStatus
);

module.exports = router;
