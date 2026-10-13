/**
 * @file assignment.schema.js
 * @description Zod validation schemas for ambulance assignments and handover lifecycle transitions.
 */

const { z } = require('zod');
const { ASSIGNMENT_STATUSES } = require('../config/constants');

const createAssignmentSchema = z.object({
  caseId: z.string({ required_error: 'caseId is required' }).min(1, 'caseId cannot be empty'),
  ambulanceId: z.string({ required_error: 'ambulanceId is required' }).min(1, 'ambulanceId cannot be empty')
});

const updateAssignmentStatusSchema = z.object({
  status: z.enum(ASSIGNMENT_STATUSES, {
    required_error: `status is required and must be one of: ${ASSIGNMENT_STATUSES.join(', ')}`
  })
});

module.exports = {
  createAssignmentSchema,
  updateAssignmentStatusSchema
};
