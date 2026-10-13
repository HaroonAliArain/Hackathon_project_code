const { z } = require('zod');

/**
 * Validation schema for user login
 */
const loginSchema = z.object({
  email: z.string().email('Valid email required').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required')
});

module.exports = { loginSchema };
