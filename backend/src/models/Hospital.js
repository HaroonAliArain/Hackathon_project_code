/**
 * @file Hospital.js
 * @description Mongoose model for hospital facilities and their capacity metadata in EmergencyLink.
 */

const mongoose = require('mongoose');
const { HOSPITAL_STATUSES } = require('../config/constants');

const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true
    },
    location: {
      lat: {
        type: Number,
        required: [true, 'Latitude is required']
      },
      lng: {
        type: Number,
        required: [true, 'Longitude is required']
      },
      address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true
      }
    },
    specialties: [
      {
        type: String,
        trim: true
      }
    ],
    equipment: [
      {
        type: String,
        trim: true
      }
    ],
    status: {
      type: String,
      enum: {
        values: HOSPITAL_STATUSES,
        message: '{VALUE} is not a valid hospital status'
      },
      default: 'active',
      index: true
    },
    contactPhone: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Explicit index on status
hospitalSchema.index({ status: 1 });

// Transform output JSON to remove __v
hospitalSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

hospitalSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Hospital = mongoose.model('Hospital', hospitalSchema);

module.exports = Hospital;
