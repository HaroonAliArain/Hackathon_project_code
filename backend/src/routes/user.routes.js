/**
 * @file user.routes.js
 * @description Express router for user administration endpoints with RBAC and validation.
 */

const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { createUserSchema, updateUserSchema } = require('../validation/user.schema');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('hospital_admin', 'system_admin'),
  userController.list
);

router.post(
  '/',
  authenticate,
  requireRole('hospital_admin', 'system_admin'),
  validate(createUserSchema),
  userController.create
);

router.patch(
  '/:id',
  authenticate,
  requireRole('hospital_admin', 'system_admin'),
  validate(updateUserSchema),
  userController.update
);

module.exports = router;
