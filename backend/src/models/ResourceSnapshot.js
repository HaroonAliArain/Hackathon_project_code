/**
 * @file ResourceSnapshot.js
 * @description Mongoose model for append-only hospital resource state snapshots in EmergencyLink.
 * The latest snapshot per (hospitalId, resourceType) represents the current real-time state.
 */

const mongoose = require('mongoose');
const { RESOURCE_TYPES } = require('../config/constants');

const resourceSnapshotSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required']
    },
    resourceType: {
      type: String,
      enum: {
        values: RESOURCE_TYPES,
        message: '{VALUE} is not a valid resource type'
      },
      required: [true, 'Resource type is required']
    },
    availableCount: {
      type: Number,
      default: null,
      min: [0, 'Available count cannot be negative']
    },
    totalCapacity: {
      type: Number,
      default: null,
      min: [0, 'Total capacity cannot be negative']
    },
    reportedAt: {
      type: Date,
      default: Date.now
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index to quickly fetch the latest snapshot for a hospital's resource
resourceSnapshotSchema.index({ hospitalId: 1, resourceType: 1, reportedAt: -1 });

// Transform output JSON and Object to remove __v
resourceSnapshotSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

resourceSnapshotSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const ResourceSnapshot = mongoose.model('ResourceSnapshot', resourceSnapshotSchema);

module.exports = ResourceSnapshot;
