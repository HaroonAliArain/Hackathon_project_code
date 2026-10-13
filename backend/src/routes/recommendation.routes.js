/**
 * @file recommendation.routes.js
 * @description Express router for hospital recommendation endpoints with RBAC and validation.
 */

const express = require('express');
const recommendationController = require('../controllers/recommendation.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { recommendSchema } = require('../validation/recommendation.schema');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requireRole('coordinator', 'system_admin'),
  validate(recommendSchema),
  recommendationController.getRecommendations
);

module.exports = router;
