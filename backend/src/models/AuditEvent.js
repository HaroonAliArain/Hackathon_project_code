/**
 * @file AuditEvent.js
 * @description Mongoose model for immutable, append-only audit trail logging in EmergencyLink.
 * No update or delete operations are permitted.
 */

const mongoose = require('mongoose');
const { AUDIT_EVENT_TYPES } = require('../config/constants');

const auditEventSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor ID is required'],
      index: true
    },
    actorRole: {
      type: String,
      required: [true, 'Actor role is required'],
      trim: true
    },
    eventType: {
      type: String,
      enum: {
        values: AUDIT_EVENT_TYPES,
        message: '{VALUE} is not a valid audit event type'
      },
      required: [true, 'Event type is required']
    },
    recordType: {
      type: String,
      required: [true, 'Record type is required'],
      trim: true
    },
    recordId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Record ID is required']
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    source: {
      type: String,
      enum: {
        values: ['online', 'offline-sync'],
        message: '{VALUE} is not a valid audit source'
      },
      default: 'online'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
auditEventSchema.index({ recordType: 1, recordId: 1 });
auditEventSchema.index({ actorId: 1 });
auditEventSchema.index({ timestamp: -1 });

// Helper to forbid mutation operations
const preventAuditMutation = function (next) {
  const err = new Error('AuditEvent is strictly append-only. Updates and deletions are not permitted.');
  if (typeof next === 'function') {
    return next(err);
  }
  throw err;
};

// Document-level delete guard
auditEventSchema.pre('deleteOne', { document: true, query: false }, preventAuditMutation);

// Query-level update and delete guards
auditEventSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
    'findOneAndRemove'
  ],
  preventAuditMutation
);

// Transform output JSON to remove __v
auditEventSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

auditEventSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);

module.exports = AuditEvent;
