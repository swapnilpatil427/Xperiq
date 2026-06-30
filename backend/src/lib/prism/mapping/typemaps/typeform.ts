/**
 * Typeform deterministic type-map (architecture-ingestion.md §6).
 * Key on `field.ref` (stable). opinion_scale→rating_numeric, rating→rating_stars,
 * picture_choice→image_choice (re-host), group→Block, payment/calendly→preserve raw.
 */
import type { TypeMap } from './index';

export const typeformTypeMap: TypeMap = {
  short_text:    { target: 'short_text' },
  long_text:     { target: 'open_text' },
  multiple_choice: { target: 'multiple_choice' },   // Typeform multi-select is flagged via allow_multiple_selection at field level
  dropdown:      { target: 'dropdown' },
  yes_no:        { target: 'multiple_choice' },
  legal:         { target: 'multiple_choice' },
  opinion_scale: { target: 'rating_numeric', scaleSensitive: true },
  rating:        { target: 'rating_stars', scaleSensitive: true },
  nps:           { target: 'nps', metric: 'nps', scaleSensitive: true },
  number:        { target: 'number' },
  email:         { target: 'short_text' },
  phone_number:  { target: 'short_text' },
  website:       { target: 'short_text' },
  date:          { target: 'date' },
  picture_choice: { target: 'image_choice' },        // re-host images
  ranking:       { target: 'ranking' },
  matrix:        { target: 'matrix' },
  file_upload:   { target: 'preserve' },
  // Non-question / unmapped → preserve raw verbatim.
  group:         { target: 'preserve' },              // → Block (structural, handled in transform)
  statement:     { target: 'display_text' },
  payment:       { target: 'preserve' },
  calendly:      { target: 'preserve' },
};
