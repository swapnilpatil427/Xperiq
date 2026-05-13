const { z } = require('zod');

const generateSurveySchema = z.object({
  intent: z.string().min(1, 'intent is required').max(2000),
  surveyTypeId: z.string().max(100).optional(),
});

const analyzeInsightsSchema = z.object({
  surveyId: z.string().min(1, 'surveyId is required'),
});

const refineSurveySchema = z.object({
  questions: z.array(z.record(z.unknown())).min(1, 'questions array is required'),
  message: z.string().min(1, 'message is required').max(2000),
  context: z.record(z.unknown()).optional(),
});

module.exports = { generateSurveySchema, analyzeInsightsSchema, refineSurveySchema };
