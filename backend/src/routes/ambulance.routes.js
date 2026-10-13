const express = require('express');
const router = express.Router();
const ambulanceController = require('../controllers/ambulance.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireAmbulanceScope } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { updateStatusSchema } = require('../validation/ambulance.schema');

/**
 * @route   GET /api/ambulances
 * @desc    List all ambulances with base hospitals
 * @access  Private (Authenticated)
 */
router.get('/', authenticate, ambulanceController.list);

/**
 * @route   PATCH /api/ambulances/:id/status
 * @desc    Update ambulance status and location
 * @access  Private (coordinator, ambulance_staff, system_admin)
 */
router.patch(
  '/:id/status',
  authenticate,
  requireRole('coordinator', 'ambulance_staff', 'system_admin'),
  requireAmbulanceScope(),
  validate(updateStatusSchema),
  ambulanceController.updateStatus
);

module.exports = router;
