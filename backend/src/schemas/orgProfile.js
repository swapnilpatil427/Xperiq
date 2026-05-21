const { z } = require('zod');

const updateOrgProfileSchema = z.object({
  industry: z.string().max(100).optional(),
  sub_vertical: z.string().max(200).optional(),
  company_size: z.string().max(50).optional(),
  use_case: z.string().max(200).optional(),
  primary_use_case: z.string().max(200).optional(),
  target_audience: z.string().max(500).optional(),
  website: z.string().max(500).optional(),
  brand_description: z.string().max(2000).optional(),
  brand_name: z.string().max(200).optional(),
  product_name: z.string().max(200).optional(),
  region: z.string().max(100).optional(),
  brand_colors: z.record(z.string()).optional(),
  brand_fonts: z.record(z.string()).optional(),
});

module.exports = { updateOrgProfileSchema };
