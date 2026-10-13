/**
 * @file user.schema.js
 * @description Zod validation schemas for administrative user creation and account modifications.
 */

const { z } = require('zod');
const { ROLES, ACCOUNT_STATUSES } = require('../config/constants');

const createUserSchema = z.object({
  name: z.string({ required_error: 'name is required' }).min(2, 'Name must be at least 2 characters'),
  email: z.string({ required_error: 'email is required' }).email('Valid email is required'),
  password: z.string({ required_error: 'password is required' }).min(6, 'Password must be at least 6 characters'),
  role: z.enum(ROLES, { required_error: `role must be one of: ${ROLES.join(', ')}` }),
  hospitalId: z.string().optional().nullable(),
  ambulanceId: z.string().optional().nullable(),
  accountStatus: z.enum(ACCOUNT_STATUSES).optional()
});

const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: z.enum(ROLES).optional(),
  accountStatus: z.enum(ACCOUNT_STATUSES).optional(),
  hospitalId: z.string().optional().nullable(),
  ambulanceId: z.string().optional().nullable(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
});

module.exports = {
  createUserSchema,
  updateUserSchema
};
