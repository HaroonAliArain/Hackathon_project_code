const { z } = require('zod');
const {
  EMERGENCY_STATUSES,
  PRIORITY_CATEGORIES,
  RESOURCE_TYPES
} = require('../config/constants');

// Combine priority enums to allow both standard names and shorthand P1-P4
const priorityValues = Array.from(
  new Set([...PRIORITY_CATEGORIES, 'P1', 'P2', 'P3', 'P4', 'critical', 'urgent', 'standard'])
);

// Allow singular constants as well as common plural variations
const resourceTypeValues = Array.from(
  new Set([
    ...RESOURCE_TYPES,
    'icu_beds',
    'ventilators',
    'general_beds',
    'operating_rooms',
    'oxygen_cylinders',
    'blood_units'
  ])
);

/**
 * Validation schema for registering an emergency
 */
const createEmergencySchema = z.object({
  priorityCategory: z.enum(priorityValues),
  summary: z.string().max(500, 'Summary must not exceed 500 characters').optional(),
  requiredResources: z
    .array(
      z.object({
        resourceType: z.enum(resourceTypeValues),
        minCount: z.number().int().positive('minCount must be a positive integer').default(1)
      })
    )
    .default([]),
  requiredSpecialties: z.array(z.string().trim().min(1)).optional().default([]),
  pickupLocation: z.object({
    lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
    lng: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
    address: z.string().trim().optional()
  }),
  patientInfo: z
    .object({
      name: z.string().optional(),
      age: z.number().int().nonnegative().optional(),
      gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
      contactNumber: z.string().optional()
    })
    .optional(),
  notes: z.string().optional()
});

/**
 * Validation schema for updating emergency status
 */
const updateStatusSchema = z.object({
  status: z.enum(EMERGENCY_STATUSES),
  note: z.string().optional(),
  reason: z.string().optional()
});

/**
 * Validation schema for querying emergencies
 */
const emergencyQuerySchema = z.object({
  status: z.enum(EMERGENCY_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

module.exports = {
  createEmergencySchema,
  updateStatusSchema,
  emergencyQuerySchema
};
