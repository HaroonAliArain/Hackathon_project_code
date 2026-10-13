const ApiError = require('../utils/ApiError');

/**
 * Validate request body against a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Express middleware
 */
const validate = (schema) => (req, res, next) => {
  try {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    req.body = result.data;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = validate;
module.exports.validate = validate;
