/**
 * @file dashboard.routes.js
 * @description Express router for real-time operational dashboard endpoints.
 */

const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  authenticate,
  dashboardController.summary
);

router.get(
  '/summary',
  authenticate,
  dashboardController.summary
);

module.exports = router;
