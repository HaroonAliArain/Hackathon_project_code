/**
 * @file recommendation.schema.js
 * @description Zod validation schema for recommendation requests.
 */

const { z } = require('zod');

const recommendSchema = z.object({
  caseId: z.string({ required_error: 'caseId is required' }).min(1, 'caseId cannot be empty')
});

module.exports = {
  recommendSchema
};
