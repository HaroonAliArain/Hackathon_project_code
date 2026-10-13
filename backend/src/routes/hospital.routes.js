const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospital.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireHospitalScope } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { updateResourcesSchema, createHospitalSchema } = require('../validation/hospital.schema');

/**
 * @route   GET /api/hospitals
 * @desc    Get all hospitals with real-time calculated resource freshness
 * @access  Private (Authenticated)
 */
router.get('/', authenticate, hospitalController.listHospitals);

router.post(
  '/',
  authenticate,
  requireRole('system_admin'),
  validate(createHospitalSchema),
  hospitalController.createHospital
);

/**
 * @route   GET /api/hospitals/:id/resources
 * @desc    Get specific hospital's resources and recent snapshot history
 * @access  Private (Authenticated)
 */
router.get('/:id/resources', authenticate, hospitalController.getResources);

/**
 * @route   PUT /api/hospitals/:id/resources
 * @desc    Append updated resource snapshot for hospital
 * @access  Private (hospital_staff, hospital_admin, system_admin scoped to hospital)
 */
router.put(
  '/:id/resources',
  authenticate,
  requireRole('hospital_staff', 'hospital_admin', 'system_admin'),
  requireHospitalScope(),
  validate(updateResourcesSchema),
  hospitalController.updateResources
);

/**
 * @route   POST /api/hospitals/:id/resources/confirm
 * @desc    Confirm current hospital resources without modifying counts
 * @access  Private (hospital_staff, hospital_admin, system_admin scoped to hospital)
 */
router.post(
  '/:id/resources/confirm',
  authenticate,
  requireRole('hospital_staff', 'hospital_admin', 'system_admin'),
  requireHospitalScope(),
  hospitalController.confirmResources
);

module.exports = router;
