/**
 * CSV / generic-file deterministic type-map.
 *
 * CSV has no declared question types, so the "source type" here is an INFERRED
 * type emitted by PROFILE (value-distribution sniffing) rather than a source
 * field. The resolver applies these once PROFILE has tagged each column with a
 * coarse inferred type. Anything unrecognized → preserve-as-embedded (never
 * dropped — architecture-ingestion.md §6 "Unmapped / exotic").
 */
import type { TypeMap } from './index';

export const csvTypeMap: TypeMap = {
  // ── Canonical keys: the `InferredType` vocabulary actually emitted by PROFILE
  //    (parsing/profile.ts `inferColumnType`): nps | scale | number | date |
  //    email | boolean | choice | text | null. These are what file imports hit.
  nps:    { target: 'nps', metric: 'nps', scaleSensitive: true },     // 0–10 integer column
  scale:  { target: 'rating_numeric', metric: 'csat', scaleSensitive: true }, // 1–5/1–7 satisfaction-style
  number: { target: 'number' },
  date:   { target: 'date' },
  email:  { target: 'embedded_data' },
  boolean: { target: 'multiple_choice' },
  choice: { target: 'multiple_choice' },
  text:   { target: 'open_text' },
  // `null` (all-blank column) → preserve so it's never dropped; surfaced for review.
  null:   { target: 'embedded_data' },

  // ── Legacy aliases (kept for any caller/profiler emitting the older vocabulary)
  free_text:         { target: 'open_text' },
  short_text:        { target: 'short_text' },
  categorical:       { target: 'multiple_choice' },
  categorical_multi: { target: 'checkbox' },
  numeric:           { target: 'number' },
  nps_scale:         { target: 'nps', metric: 'nps', scaleSensitive: true },
  csat_scale:        { target: 'rating_numeric', metric: 'csat', scaleSensitive: true },
  rating_scale:      { target: 'rating_numeric', scaleSensitive: true },
  identifier:        { target: 'embedded_data' },
};
