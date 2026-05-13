const { z } = require('zod');

const questionSchema = z.object({
  id: z.string(),
  type: z.string(),
  question: z.string().optional(),
}).passthrough();

const createSurveySchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().max(2000).optional(),
  questions: z.array(questionSchema).optional().default([]),
  survey_type_id: z.string().max(100).optional(),
  template_id: z.string().max(100).optional(),
  intent: z.string().max(1000).optional(),
  thank_you_message: z.string().max(2000).optional(),
});

const updateSurveySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'paused', 'closed']).optional(),
  questions: z.array(questionSchema).optional(),
  survey_type_id: z.string().max(100).optional(),
  template_id: z.string().max(100).optional(),
  intent: z.string().max(1000).optional(),
  thank_you_message: z.string().max(2000).optional(),
});

module.exports = { createSurveySchema, updateSurveySchema };
