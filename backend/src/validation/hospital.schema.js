const { z } = require('zod');
const { RESOURCE_TYPES } = require('../config/constants');

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

module.exports = {
  updateResourcesSchema,
  confirmResourcesSchema
};
