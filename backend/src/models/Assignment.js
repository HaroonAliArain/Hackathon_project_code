/**
 * @file Assignment.js
 * @description Mongoose model for ambulance dispatch assignments and handover lifecycle timestamps in EmergencyLink.
 */

const mongoose = require('mongoose');
const { ASSIGNMENT_STATUSES } = require('../config/constants');

const assignmentSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      required: [true, 'Case ID is required'],
      trim: true,
      index: true
    },
    ambulanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ambulance',
      required: [true, 'Ambulance ID is required'],
      index: true
    },
    destinationHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Destination Hospital ID is required']
    },
    status: {
      type: String,
      enum: {
        values: ASSIGNMENT_STATUSES,
        message: '{VALUE} is not a valid assignment status'
      },
      default: 'assigned',
      index: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned by user reference is required']
    },
    timestamps: {
      _id: false,
      assignedAt: {
        type: Date,
        default: Date.now
      },
      enRouteAt: {
        type: Date,
        default: null
      },
      arrivedAt: {
        type: Date,
        default: null
      },
      handedOverAt: {
        type: Date,
        default: null
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
assignmentSchema.index({ caseId: 1, status: 1 });

// Transform output JSON to remove __v
assignmentSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

assignmentSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Assignment = mongoose.model('Assignment', assignmentSchema);

module.exports = Assignment;
