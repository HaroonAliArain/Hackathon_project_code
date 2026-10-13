/**
 * @file Emergency.js
 * @description Mongoose model for emergency triage cases and hospital coordination in EmergencyLink.
 */

const mongoose = require('mongoose');
const {
  EMERGENCY_STATUSES,
  PRIORITY_CATEGORIES,
  RESOURCE_TYPES
} = require('../config/constants');

const emergencySchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      unique: true,
      required: [true, 'Case ID is required'],
      trim: true
    },
    priorityCategory: {
      type: String,
      enum: {
        values: PRIORITY_CATEGORIES,
        message: '{VALUE} is not a valid priority category'
      },
      required: [true, 'Priority category is required']
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [500, 'Summary must not exceed 500 characters']
    },
    requiredResources: [
      {
        _id: false,
        resourceType: {
          type: String,
          enum: {
            values: RESOURCE_TYPES,
            message: '{VALUE} is not a valid resource type'
          },
          required: true
        },
        minCount: {
          type: Number,
          default: 1,
          min: [1, 'Minimum required count must be at least 1']
        }
      }
    ],
    requiredSpecialties: [
      {
        type: String,
        trim: true
      }
    ],
    pickupLocation: {
      lat: {
        type: Number,
        required: [true, 'Pickup latitude is required']
      },
      lng: {
        type: Number,
        required: [true, 'Pickup longitude is required']
      },
      address: {
        type: String,
        trim: true
      }
    },
    status: {
      type: String,
      enum: {
        values: EMERGENCY_STATUSES,
        message: '{VALUE} is not a valid emergency status'
      },
      default: 'registered',
      index: true
    },
    confirmedHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by user reference is required']
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

// Indexes
emergencySchema.index({ caseId: 1 }, { unique: true });
emergencySchema.index({ status: 1 });

/**
 * Static method to auto-generate human-readable case IDs in format EL-YYYYMMDD-NNNN.
 * Queries existing records for today's date prefix to allocate the next sequence number.
 * @returns {Promise<string>}
 */
emergencySchema.statics.generateCaseId = async function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `EL-${year}${month}${day}`;

  // Find the highest sequence number for today
  const latestEmergency = await this.findOne({
    caseId: new RegExp(`^${prefix}-`)
  })
    .sort({ caseId: -1 })
    .select('caseId')
    .lean();

  let nextSequenceNumber = 1;
  if (latestEmergency && latestEmergency.caseId) {
    const parts = latestEmergency.caseId.split('-');
    if (parts.length >= 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSequenceNumber = parsed + 1;
      }
    }
  } else {
    // Fallback: count documents with prefix
    const count = await this.countDocuments({
      caseId: new RegExp(`^${prefix}`)
    });
    nextSequenceNumber = count + 1;
  }

  const paddedSequence = String(nextSequenceNumber).padStart(4, '0');
  return `${prefix}-${paddedSequence}`;
};

/**
 * Pre-validate hook: automatically assign generated caseId if document is new and caseId is missing.
 */
emergencySchema.pre('validate', async function () {
  if (this.isNew && !this.caseId) {
    this.caseId = await this.constructor.generateCaseId();
  }
});

// Transform output JSON to remove __v
emergencySchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

emergencySchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Emergency = mongoose.model('Emergency', emergencySchema);

module.exports = Emergency;
