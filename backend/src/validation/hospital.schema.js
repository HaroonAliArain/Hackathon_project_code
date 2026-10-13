const { z } = require('zod');
const { RESOURCE_TYPES, HOSPITAL_STATUSES } = require('../config/constants');

const allowedResourceTypes = Array.from(
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

const updateResourceItemSchema = z.object({
  resourceType: z.enum(allowedResourceTypes),
  availableCount: z.number().int().min(0, 'Available count cannot be negative').nullable(),
  totalCapacity: z.number().int().min(0, 'Total capacity cannot be negative').optional()
});

/**
 * Validation schema for updating hospital resources
 */
const updateResourcesSchema = z.object({
  updates: z.array(updateResourceItemSchema).min(1, 'At least one resource update item is required'),
  verified: z.boolean().optional().default(false)
});

/**
 * Validation schema for confirming hospital resources
 */
const confirmResourcesSchema = z.object({
  note: z.string().optional()
}).optional().default({});

const createHospitalSchema = z.object({
  name: z.string().trim().min(2).max(160),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().trim().min(2).max(300)
  }),
  specialties: z.array(z.string().trim().min(1).max(100)).optional().default([]),
  equipment: z.array(z.string().trim().min(1).max(100)).optional().default([]),
  status: z.enum(HOSPITAL_STATUSES).optional().default('active'),
  contactPhone: z.string().trim().max(40).optional()
});

module.exports = {
  updateResourcesSchema,
  confirmResourcesSchema,
  createHospitalSchema
};
