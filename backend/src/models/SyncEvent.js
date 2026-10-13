/**
 * @file SyncEvent.js
 * @description Mongoose model for offline sync event processing, conflict detection, and idempotency in EmergencyLink.
 */

const mongoose = require('mongoose');
const { SYNC_STATUSES, CONFLICT_STATUSES } = require('../config/constants');

const syncEventSchema = new mongoose.Schema(
  {
    clientEventId: {
      type: String,
      required: [true, 'Client event ID is required'],
      unique: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    type: {
      type: String,
      required: [true, 'Event type is required'],
      trim: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Payload is required']
    },
    baseVersion: {
      type: Number,
      default: null
    },
    clientTimestamp: {
      type: Date,
      required: [true, 'Client timestamp is required']
    },
    receivedAt: {
      type: Date,
      default: Date.now
    },
    syncStatus: {
      type: String,
      enum: {
        values: SYNC_STATUSES,
        message: '{VALUE} is not a valid sync status'
      },
      required: [true, 'Sync status is required']
    },
    conflictStatus: {
      type: String,
      enum: {
        values: CONFLICT_STATUSES,
        message: '{VALUE} is not a valid conflict status'
      },
      default: 'none',
      index: true
    },
    resolution: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
syncEventSchema.index({ clientEventId: 1 }, { unique: true });
syncEventSchema.index({ conflictStatus: 1 });

// Transform output JSON to remove __v
syncEventSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

syncEventSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const SyncEvent = mongoose.model('SyncEvent', syncEventSchema);

module.exports = SyncEvent;
