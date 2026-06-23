import { z } from 'zod';

export const generateSurveySchema = z.object({
  intent: z.string().min(1, 'intent is required').max(2000),
  surveyTypeId: z.string().max(100).optional(),
});

export const analyzeInsightsSchema = z.object({
  surveyId: z.string().min(1, 'surveyId is required'),
});

export const refineSurveySchema = z.object({
  questions: z.array(z.record(z.unknown())).min(1, 'questions array is required'),
  message: z.string().min(1, 'message is required').max(2000),
  context: z.record(z.unknown()).optional(),
});

export type GenerateSurveyInput = z.infer<typeof generateSurveySchema>;
export type AnalyzeInsightsInput = z.infer<typeof analyzeInsightsSchema>;
export type RefineSurveyInput = z.infer<typeof refineSurveySchema>;
