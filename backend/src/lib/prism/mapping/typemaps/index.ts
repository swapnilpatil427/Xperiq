/**
 * Prism deterministic type-maps (mapping resolver Layer 1).
 *
 * Static, per-connector tables: `sourceType → { target QuestionType, metric }`.
 * A table lookup — zero AI, zero human review — covers ~80–90% of fields
 * (architecture-ingestion.md §6 Layer 1, "Question-type mapping — highlights").
 *
 * `target` is an Xperiq QuestionType string (or 'embedded_data' / 'preserve' /
 * 'display_text'). `metric` tags metric-bearing types so the insight + parity
 * layers treat them correctly. A miss (undefined) means "unknown" → the resolver
 * falls to Layer 2/3, defaulting unmapped to preserve-as-embedded.
 */

export type DeterministicTarget = {
  target: string;                       // Xperiq QuestionType or 'embedded_data' | 'preserve' | 'display_text'
  metric?: 'nps' | 'csat' | 'ces' | null;
  /** When set, downstream marks a scale change as metric-affecting (needs re-confirm). */
  scaleSensitive?: boolean;
};

export type TypeMap = Record<string, DeterministicTarget>;

import { qualtricsTypeMap } from './qualtrics';
import { typeformTypeMap } from './typeform';
import { surveymonkeyTypeMap } from './surveymonkey';
import { googleformsTypeMap } from './googleforms';
import { csvTypeMap } from './csv';

/** Registry keyed by connector platform id. */
export const typeMaps: Record<string, TypeMap> = {
  qualtrics: qualtricsTypeMap,
  typeform: typeformTypeMap,
  surveymonkey: surveymonkeyTypeMap,
  googleforms: googleformsTypeMap,
  csv: csvTypeMap,
};

/**
 * Resolve a source type deterministically for a platform. Case-insensitive on
 * the source type. Returns undefined when the platform/type isn't known → caller
 * routes to Layer 2/3.
 */
export function lookupType(platform: string, sourceType: string | undefined): DeterministicTarget | undefined {
  if (!sourceType) return undefined;
  const map = typeMaps[platform.toLowerCase()];
  if (!map) return undefined;
  return map[sourceType] ?? map[sourceType.toLowerCase()];
}

export { qualtricsTypeMap, typeformTypeMap, surveymonkeyTypeMap, googleformsTypeMap, csvTypeMap };
