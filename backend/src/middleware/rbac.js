const ApiError = require('../utils/ApiError');

/**
 * Enforce role-based access control
 * @param  {...string|string[]} allowedRoles
 * @returns {Function} Express middleware
 */
const requireRole = (...allowedRoles) => {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden('Your role does not have permission for this action');
    }
    next();
  };
};

/**
 * Enforce hospital-scoped access control
 * @returns {Function} Express middleware
 */
const requireHospitalScope = () => {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    if (['system_admin', 'coordinator'].includes(req.user.role)) {
      return next();
    }
    const targetHospitalId = req.params.hospitalId || req.params.id;
    if (targetHospitalId) {
      const userHospitalId = req.user.hospitalId ? req.user.hospitalId.toString() : null;
      if (!userHospitalId || userHospitalId !== targetHospitalId.toString()) {
        throw ApiError.forbidden('You can only access your own hospital resources');
      }
    }
    return next();
  };
};

/**
 * Enforce ambulance-scoped access control
 * @returns {Function} Express middleware
 */
const requireAmbulanceScope = () => {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    if (['system_admin', 'coordinator'].includes(req.user.role)) {
      return next();
    }
    const targetAmbulanceId = req.params.ambulanceId || req.params.id;
    if (targetAmbulanceId) {
      const userAmbulanceId = req.user.ambulanceId ? req.user.ambulanceId.toString() : null;
      if (!userAmbulanceId || userAmbulanceId !== targetAmbulanceId.toString()) {
        throw ApiError.forbidden('You can only access your own ambulance resources');
      }
    }
    return next();
  };
};

module.exports = {
  requireRole,
  requireHospitalScope,
  requireAmbulanceScope
};
