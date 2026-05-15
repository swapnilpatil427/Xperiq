const { z } = require('zod');

const questionSchema = z.object({
  id:       z.string(),
  type:     z.enum(['nps','csat','rating','slider','multiple_choice','checkbox','dropdown','ranking','open_text','short_text','matrix','date','statement']),
  question: z.string().optional(),
  required: z.boolean().optional(),
  // Scale
  labelLow:    z.string().nullish(),
  labelHigh:   z.string().nullish(),
  scaleMax:    z.number().int().nullish(),
  ratingStyle: z.enum(['stars','numbers']).nullish(),
  csatStyle:   z.enum(['emoji','stars','numbers']).nullish(),
  // Slider
  min:       z.number().nullish(),
  max:       z.number().nullish(),
  step:      z.number().nullish(),
  showValue: z.boolean().nullish(),
  // Choice
  options:       z.array(z.string()).nullish(),
  allowOther:    z.boolean().nullish(),
  randomize:     z.boolean().nullish(),
  maxSelections: z.number().int().nullish(),
  placeholder:   z.string().nullish(),
  // Text
  maxLength:  z.number().int().nullish(),
  validation: z.enum(['email','url','number','phone']).nullish(),
  // Matrix
  rows:       z.array(z.string()).nullish(),
  columns:    z.array(z.string()).nullish(),
  matrixType: z.enum(['radio','checkbox']).nullish(),
  // Date
  dateType: z.enum(['date','time','datetime']).nullish(),
  // Statement
  isStatement: z.boolean().nullish(),
  // Logic
  skipLogic:    z.array(z.object({
    id:          z.string(),
    condition:   z.object({
      operator: z.enum(['eq','neq','lt','gt','lte','gte','contains','answered','not_answered']),
      value:    z.union([z.string(), z.number(), z.null()]).optional(),
    }),
    destination: z.string(),
  })).nullish(),
  displayLogic: z.object({
    sourceQuestionId: z.string(),
    operator:         z.string(),
    value:            z.union([z.string(), z.number(), z.null()]).optional(),
  }).nullish(),
}).passthrough();

const createSurveySchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().max(2000).nullish(),
  questions: z.array(questionSchema).optional().default([]),
  survey_type_id: z.string().max(100).nullish(),
  template_id: z.string().max(100).nullish(),
  intent: z.string().max(1000).nullish(),
  thank_you_message: z.string().max(2000).nullish(),
});

const updateSurveySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullish(),
  status: z.enum(['draft', 'active', 'paused', 'closed']).optional(),
  questions: z.array(questionSchema).optional(),
  survey_type_id: z.string().max(100).nullish(),
  template_id: z.string().max(100).nullish(),
  intent: z.string().max(1000).nullish(),
  thank_you_message: z.string().max(2000).nullish(),
});

module.exports = { createSurveySchema, updateSurveySchema };
