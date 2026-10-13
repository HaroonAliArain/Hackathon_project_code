const { z } = require('zod');
const { AMBULANCE_STATUSES } = require('../config/constants');
const mongoose = require('mongoose');

// Combine model-defined statuses with common lifecycle variants
const allowedStatuses = Array.from(
  new Set([
    ...AMBULANCE_STATUSES,
    'maintenance',
    'dispatched',
    'at_scene',
    'transporting',
    'at_hospital',
    'out_of_service'
  ])
);

/**
 * Validation schema for updating ambulance status and location
 */
const updateStatusSchema = z.object({
  status: z.enum(allowedStatuses),
  lastKnownLocation: z
    .object({
      lat: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
      lng: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180')
    })
    .optional()
});

const createAmbulanceSchema = z.object({
  ambulanceId: z.string().trim().min(2).max(40),
  baseHospitalId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'A valid base hospital ID is required').optional().nullable(),
  lastKnownLocation: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180)
    })
    .optional()
});

module.exports = {
  updateStatusSchema,
  createAmbulanceSchema
};
