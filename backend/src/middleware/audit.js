const mongoose = require('mongoose');

/**
 * Safe resolver for AuditEvent model
 * @returns {import('mongoose').Model|null}
 */
const getAuditEventModel = () => {
  try {
    return require('../models/AuditEvent');
  } catch (e1) {
    try {
      return require('../models/auditEvent.model');
    } catch (e2) {
      try {
        const models = require('../models');
        if (models && models.AuditEvent) return models.AuditEvent;
      } catch (e3) {
        // Continue to mongoose.models check
      }
      if (mongoose.models && mongoose.models.AuditEvent) {
        return mongoose.models.AuditEvent;
      }
      return null;
    }
  }
};

/**
 * Filter out sensitive credentials and tokens
 * @param {any} data
 * @returns {any}
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  if (data instanceof mongoose.Types.ObjectId) {
    return data.toString();
  }
  if (data instanceof Date) {
    return data.toISOString();
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  const raw = typeof data.toObject === 'function' ? data.toObject() : data;
  const sensitiveKeys = new Set([
    'password',
    'passwordHash',
    'token',
    'tokens',
    'jwt',
    'secret',
    'refreshToken',
    'accessToken'
  ]);
  const sanitized = {};

  for (const [key, val] of Object.entries(raw)) {
    if (sensitiveKeys.has(key)) {
      continue;
    }
    if (val && typeof val === 'object') {
      sanitized[key] = sanitizeData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

/**
 * Helper function to create an AuditEvent asynchronously without blocking the request path
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.actorId
 * @param {string} params.actorRole
 * @param {string} params.eventType
 * @param {string} params.recordType
 * @param {string|mongoose.Types.ObjectId} params.recordId
 * @param {any} [params.before]
 * @param {any} [params.after]
 * @param {string} [params.source='online']
 */
const createAuditEvent = ({
  actorId,
  actorRole,
  eventType,
  recordType,
  recordId,
  before = null,
  after = null,
  source = 'online'
}) => {
  setImmediate(async () => {
    try {
      const AuditEvent = getAuditEventModel();
      if (!AuditEvent) {
        return;
      }
      await AuditEvent.create({
        actorId,
        actorRole,
        eventType,
        recordType,
        recordId,
        before: sanitizeData(before),
        after: sanitizeData(after),
        source
      });
    } catch (err) {
      console.error('[AuditEvent] Failed to log audit event:', err.message);
    }
  });
};

module.exports = {
  createAuditEvent,
  sanitizeData
};
module.exports.createAuditEvent = createAuditEvent;
