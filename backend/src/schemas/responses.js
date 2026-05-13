const { z } = require('zod');

const submitResponseSchema = z.object({
  answers: z.array(z.record(z.unknown())).min(1, 'answers array is required'),
  publishToken: z.string().min(1, 'publishToken is required'),
});

module.exports = { submitResponseSchema };
