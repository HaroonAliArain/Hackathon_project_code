const config = require('../config/env');

/**
 * Global Express error handling middleware
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = Array.isArray(err.details) ? err.details : [];

  // Mongoose Validation Error
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.keys(err.errors).map((key) => ({
      field: key,
      message: err.errors[key].message
    }));
  }
  // Mongoose Cast Error (e.g. invalid ObjectId)
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = `Invalid format for field ${err.path}`;
    details = [
      {
        field: err.path,
        message: `Invalid value provided: ${err.value}`
      }
    ];
  }
  // JWT Errors
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHENTICATED';
    message = 'Token expired';
    details = [];
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'UNAUTHENTICATED';
    message = 'Invalid token';
    details = [];
  }
  // Mongo Duplicate Key Error (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Duplicate key error';
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    details = fields.map((field) => ({
      field,
      message: `${field} already exists`
    }));
  }

  // Sanitize logging: do not log passwords or tokens
  if (config.NODE_ENV !== 'test') {
    const sanitizedLogMsg = message.replace(/(password|token|secret|authorization)=[^& ]+/gi, '$1=***');
    console.error(`[Error] ${statusCode} ${code}: ${sanitizedLogMsg}`);
    if (config.NODE_ENV === 'development' && err.stack) {
      console.error(err.stack);
    }
  }

  // Never leak internal 500 error messages or DB details in production
  if (statusCode === 500 && config.NODE_ENV !== 'development') {
    message = 'An unexpected error occurred';
    details = [];
  }

  const responsePayload = {
    success: false,
    error: {
      code,
      message,
      details
    }
  };

  if (config.NODE_ENV === 'development' && err.stack) {
    responsePayload.error.stack = err.stack;
  }

  return res.status(statusCode).json(responsePayload);
};

module.exports = errorHandler;
