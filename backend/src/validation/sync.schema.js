/**
 * @file sync.schema.js
 * @description Zod validation schemas for offline event synchronizations and conflict resolution.
 */

const { z } = require('zod');

const syncEventItemSchema = z.object({
  clientEventId: z.string({ required_error: 'clientEventId is required' }).uuid('clientEventId must be a valid UUID'),
  type: z.enum(['ambulance.status.update', 'resource.update', 'emergency.create'], {
    required_error: 'type must be one of: ambulance.status.update, resource.update, emergency.create'
  }),
  payload: z.record(z.any(), { required_error: 'payload object is required' }),
  baseVersion: z.number().int().optional().nullable(),
  clientTimestamp: z.string({ required_error: 'clientTimestamp is required' }).datetime('clientTimestamp must be a valid ISO-8601 string')
});

const syncEventsSchema = z.object({
  events: z
    .array(syncEventItemSchema, { required_error: 'events array is required' })
    .min(1, 'At least 1 event must be provided')
    .max(50, 'Cannot synchronize more than 50 events in a single batch')
});

const resolveConflictSchema = z.object({
  resolution: z.enum(['accept_client', 'keep_server', 'manual'], {
    required_error: 'resolution is required and must be accept_client, keep_server, or manual'
  }),
  note: z.string().max(500, 'Note must not exceed 500 characters').optional().nullable(),
  manualPayload: z.record(z.any()).optional().nullable()
});

module.exports = {
  syncEventsSchema,
  resolveConflictSchema
};
