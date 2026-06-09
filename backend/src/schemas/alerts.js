const { z } = require('zod');

const SEVERITY = ['critical', 'warning', 'info', 'success'];

const createRuleSchema = z.object({
  alertType:       z.string().min(1).max(32),
  name:            z.string().min(1).max(255),
  description:     z.string().max(2000).nullish(),
  surveyId:        z.string().uuid().nullish(),
  severity:        z.enum(SEVERITY).optional(),
  thresholdConfig: z.record(z.string(), z.any()).optional(),
  isActive:        z.boolean().optional(),
});

const updateRuleSchema = z.object({
  name:            z.string().min(1).max(255).optional(),
  description:     z.string().max(2000).nullish(),
  severity:        z.enum(SEVERITY).optional(),
  thresholdConfig: z.record(z.string(), z.any()).optional(),
  isActive:        z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

const snoozeSchema = z.object({
  until:  z.string().datetime().optional(),
  hours:  z.number().int().min(1).max(720).optional(),
  reason: z.string().max(500).optional(),
}).refine((o) => o.until || o.hours, { message: 'Provide until or hours' });

module.exports = { createRuleSchema, updateRuleSchema, snoozeSchema };
