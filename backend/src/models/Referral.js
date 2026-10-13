/**
 * @file Referral.js
 * @description Mongoose model for hospital referral requests, response notes, and recommendation ranking snapshots in EmergencyLink.
 */

const mongoose = require('mongoose');
const { REFERRAL_STATUSES } = require('../config/constants');

const referralSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      required: [true, 'Case ID is required'],
      trim: true,
      index: true
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required']
    },
    requestStatus: {
      type: String,
      enum: {
        values: REFERRAL_STATUSES,
        message: '{VALUE} is not a valid referral status'
      },
      default: 'pending',
      index: true
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requested by user reference is required']
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    responseAt: {
      type: Date,
      default: null
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    responseNote: {
      type: String,
      trim: true,
      maxlength: [500, 'Response note cannot exceed 500 characters']
    },
    escalated: {
      type: Boolean,
      default: false
    },
    rankSnapshot: {
      _id: false,
      score: {
        type: Number
      },
      explanation: [
        {
          type: String,
          trim: true
        }
      ]
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

// Compound index for finding referrals for a case & hospital
referralSchema.index({ caseId: 1, hospitalId: 1 });
referralSchema.index({ requestStatus: 1 });

// Transform output JSON to remove __v
referralSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

referralSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Referral = mongoose.model('Referral', referralSchema);

module.exports = Referral;
