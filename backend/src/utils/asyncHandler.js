/**
 * Wraps an async route handler to catch errors and forward to the next middleware
 * @param {Function} fn Async route handler function
 * @returns {Function} Express middleware handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
