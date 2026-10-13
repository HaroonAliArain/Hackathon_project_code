const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { loginSchema } = require('../validation/auth.schema');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

/**
 * @route   POST /api/v1/auth and POST /api/v1/auth/login
 * @desc    Authenticate user and return JWT with profile
 * @access  Public (Rate limited)
 */
router.post('/', authLimiter, validate(loginSchema), authController.login);
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently logged-in user profile
 * @access  Private (Authenticated)
 */
router.get('/me', authenticate, authController.getMe);

module.exports = router;
