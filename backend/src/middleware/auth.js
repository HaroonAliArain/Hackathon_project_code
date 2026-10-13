const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Resolve User model safely
 * @returns {import('mongoose').Model|null}
 */
const getUserModel = () => {
  try {
    return require('../models/User');
  } catch (e1) {
    try {
      return require('../models/user.model');
    } catch (e2) {
      try {
        const models = require('../models');
        if (models && models.User) return models.User;
      } catch (e3) {
        // Continue to mongoose.models check
      }
      if (mongoose.models && mongoose.models.User) {
        return mongoose.models.User;
      }
      return null;
    }
  }
};

/**
 * Authentication middleware verifying JWT Bearer token and attaching active user
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('No token provided');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw ApiError.unauthorized('No token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token expired');
    }
    throw ApiError.unauthorized('Invalid token');
  }

  const userId = decoded.id || decoded.userId || decoded._id;
  if (!userId) {
    throw ApiError.unauthorized('Invalid token payload');
  }

  const UserModel = getUserModel();
  if (!UserModel) {
    throw ApiError.internal('User model is not registered');
  }

  const user = await UserModel.findById(userId).select('-passwordHash');
  if (!user || user.accountStatus !== 'active') {
    throw ApiError.unauthorized('User not found or account is not active');
  }

  req.user = user;
  next();
});

module.exports = authenticate;
module.exports.authenticate = authenticate;
