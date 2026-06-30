/**
 * SurveyMonkey deterministic type-map (architecture-ingestion.md §6).
 * `single`→multiple_choice, `multiple`→checkbox; ⚠ star/smiley hide under
 * `display_type`; `demographic` composite → split + embedded. Branching not
 * importable via API → dry-run states it plainly (handled by logicExposed='none').
 */
import type { TypeMap } from './index';

export const surveymonkeyTypeMap: TypeMap = {
  // family:subtype keys (SurveyMonkey question.family + question.subtype).
  'single_choice:vertical':   { target: 'multiple_choice' },
  'single_choice:horizontal': { target: 'multiple_choice' },
  'single_choice:menu':       { target: 'dropdown' },
  'multiple_choice:vertical': { target: 'checkbox' },
  'multiple_choice':          { target: 'checkbox' },
  'single_choice':            { target: 'multiple_choice' },

  'matrix:single':   { target: 'likert', scaleSensitive: true },
  'matrix:rating':   { target: 'likert', metric: 'csat', scaleSensitive: true },
  'matrix:multi':    { target: 'matrix' },
  'matrix:menu':     { target: 'matrix' },
  'matrix:ranking':  { target: 'ranking' },

  'open_ended:single':    { target: 'short_text' },
  'open_ended:essay':     { target: 'open_text' },
  'open_ended:multi':     { target: 'open_text' },
  'open_ended:numerical': { target: 'number' },

  // Star / smiley ratings hide under display_type — caller should pass the resolved key.
  'rating:stars':   { target: 'rating_stars', scaleSensitive: true },
  'rating:smiley':  { target: 'rating_numeric', metric: 'csat', scaleSensitive: true },
  'rating:nps':     { target: 'nps', metric: 'nps', scaleSensitive: true },

  'datetime:date':       { target: 'date' },
  'demographic:international': { target: 'embedded_data' }, // composite → split + embedded
  'presentation:descriptive_text': { target: 'display_text' },
  'presentation:image':  { target: 'display_text' },
};
