const jwt = require('jsonwebtoken');
const envConfig = require('../config/env');
const ApiError = require('../utils/ApiError');
const { createAuditEvent } = require('../middleware/audit');
const User = require('../models/User');

/**
 * Service managing user authentication and profiles
 */
class AuthService {
  /**
   * Authenticate a user with email and password
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{token: string, user: Object}>}
   */
  async login(email, password) {
    const normalizedEmail = email.toLowerCase().trim();

    // Query user by email and explicitly select passwordHash
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    // Reject if user not found or account is disabled/inactive
    if (!user || user.accountStatus === 'disabled' || user.isActive === false) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Compare plaintext candidate password with hashed password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      createAuditEvent({
        actorId: user._id,
        actorRole: user.role,
        eventType: 'login_failed',
        recordType: 'User',
        recordId: user._id,
        after: { email: normalizedEmail, reason: 'invalid_password' }
      });
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Sign JWT with payload { id, role, hospitalId, ambulanceId }
    const jwtSecret = envConfig.JWT_SECRET || process.env.JWT_SECRET || 'emergency-link-jwt-secret';
    const jwtExpiresIn = envConfig.JWT_EXPIRES_IN || '8h';

    const tokenPayload = {
      id: user._id,
      role: user.role,
      hospitalId: user.hospitalId || null,
      ambulanceId: user.ambulanceId || null
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: jwtExpiresIn });

    // Log successful login audit event
    createAuditEvent({
      actorId: user._id,
      actorRole: user.role,
      eventType: 'login',
      recordType: 'User',
      recordId: user._id,
      after: { email: user.email, role: user.role }
    });

    // Strip passwordHash from returned user representation
    const userObj = user.toObject ? user.toObject() : { ...user };
    delete userObj.passwordHash;

    return {
      token,
      user: userObj
    };
  }

  /**
   * Retrieve current user profile with populated references
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getMe(userId) {
    const user = await User.findById(userId)
      .select('-passwordHash')
      .populate('hospitalId', 'name location contactPhone address')
      .populate('ambulanceId', 'ambulanceId status baseHospitalId');

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    return user;
  }
}

module.exports = new AuthService();
