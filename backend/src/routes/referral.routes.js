/**
 * @file referral.routes.js
 * @description Express router for referral endpoints with RBAC and input validation.
 */

const express = require('express');
const referralController = require('../controllers/referral.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  createReferralSchema,
  respondReferralSchema,
  clarifyReferralSchema
} = require('../validation/referral.schema');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requireRole('coordinator', 'system_admin'),
  validate(createReferralSchema),
  referralController.create
);

router.get(
  '/',
  authenticate,
  referralController.list
);

router.patch(
  '/:id/respond',
  authenticate,
  requireRole('hospital_staff', 'hospital_admin', 'system_admin'),
  validate(respondReferralSchema),
  referralController.respond
);

router.patch(
  '/:id/clarify',
  authenticate,
  requireRole('coordinator', 'system_admin'),
  validate(clarifyReferralSchema),
  referralController.clarify
);

module.exports = router;
