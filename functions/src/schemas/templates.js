const { z } = require('zod');

const questionSchema = z.object({ id: z.string(), type: z.string() }).passthrough();

const createTemplateSchema = z.object({
  label: z.string().min(1, 'label is required').max(200),
  shortLabel: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  icon: z.string().max(100).optional(),
  color: z.string().max(30).optional(),
  bg: z.string().max(30).optional(),
  metrics: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  questionCount: z.string().optional(),
  questions: z.array(questionSchema).optional(),
  scoring: z.record(z.unknown()).optional(),
  intelligence: z.record(z.unknown()).optional(),
  clonedFromId: z.string().optional(),
});

const updateTemplateSchema = createTemplateSchema
  .omit({ clonedFromId: true })
  .partial()
  .extend({ status: z.enum(['active', 'archived']).optional() });

module.exports = { createTemplateSchema, updateTemplateSchema };
