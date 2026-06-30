/**
 * Qualtrics deterministic type-map (architecture-ingestion.md §6).
 * NPS→nps (engine recomputes Detractor/Passive/Promoter); MC SAVR→multiple_choice,
 * MAVR→checkbox; Matrix→likert/matrix; side-by-side→matrix (+raw); timing/meta→embedded.
 */
import type { TypeMap } from './index';

export const qualtricsTypeMap: TypeMap = {
  // Net Promoter Score block.
  NPS: { target: 'nps', metric: 'nps', scaleSensitive: true },

  // Multiple choice — single answer / multi answer vertical/horizontal.
  'MC:SAVR': { target: 'multiple_choice' },
  'MC:MAVR': { target: 'checkbox' },
  'MC:SAHR': { target: 'multiple_choice' },
  'MC:MAHR': { target: 'checkbox' },
  'MC:DL':   { target: 'dropdown' },
  'MC:Select': { target: 'dropdown' },

  // Matrix tables.
  'Matrix:Likert':       { target: 'likert', scaleSensitive: true },
  'Matrix:TE':           { target: 'matrix' },
  'Matrix:Bipolar':      { target: 'matrix', scaleSensitive: true },
  'Matrix:RankOrder':    { target: 'ranking' },
  'SBS':                 { target: 'matrix' },        // side-by-side (+ raw preserved)

  // Text.
  'TE:SL':       { target: 'short_text' },
  'TE:ML':       { target: 'open_text' },
  'TE:Essay':    { target: 'open_text' },
  'TE:Form':     { target: 'open_text' },

  // Sliders / scales.
  Slider:        { target: 'rating_numeric', scaleSensitive: true },
  'CS':          { target: 'rating_numeric', metric: 'csat', scaleSensitive: true }, // constant sum / scale used for CSAT

  // Rank / draggable.
  RO:            { target: 'ranking' },
  PGR:           { target: 'ranking' },

  // Descriptive / structural / meta → preserve or embed.
  DB:            { target: 'display_text' },          // descriptive text block
  Timing:        { target: 'embedded_data' },
  Meta:          { target: 'embedded_data' },
  Captcha:       { target: 'embedded_data' },
  FileUpload:    { target: 'preserve' },
  Signature:     { target: 'preserve' },
};
