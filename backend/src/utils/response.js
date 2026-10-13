/**
 * Send standard success response
 * @param {Object} res Express response object
 * @param {any} data Response payload
 * @param {Object} [meta={}] Optional metadata (pagination, counts, etc.)
 * @param {number} [statusCode=200] HTTP status code
 */
const sendSuccess = (res, data = {}, meta = {}, statusCode = 200) => {
  const payload = {
    success: true,
    data
  };

  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
};

/**
 * Send standard error response
 * @param {Object} res Express response object
 * @param {Object} error Error object or ApiError
 * @param {number} [statusCode=500] Fallback HTTP status code
 */
const sendError = (res, error = {}, statusCode = 500) => {
  const status = error.statusCode || statusCode;
  const payload = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: error.details || []
    }
  };

  return res.status(status).json(payload);
};

module.exports = {
  sendSuccess,
  sendError
};
