/**
 * Custom application error class representing structured API errors
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code
   * @param {string} code Application error code
   * @param {string} message Error message
   * @param {Array} [details=[]] Error details array
   */
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Validation error', details = []) {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message) {
    return new ApiError(401, 'UNAUTHENTICATED', message || 'Authentication required');
  }

  static forbidden(message) {
    return new ApiError(403, 'FORBIDDEN', message || 'Insufficient permissions');
  }

  static notFound(message) {
    return new ApiError(404, 'NOT_FOUND', message || 'Resource not found');
  }

  static conflict(message = 'Resource conflict') {
    return new ApiError(409, 'CONFLICT', message);
  }

  static invalidTransition(from, to) {
    return new ApiError(409, 'INVALID_TRANSITION', `Cannot transition from '${from}' to '${to}'`);
  }

  static rateLimited(message = 'Too many requests') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'An unexpected error occurred') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}

module.exports = ApiError;
