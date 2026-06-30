/**
 * Google Forms deterministic type-map (architecture-ingestion.md §6).
 * RADIO/DROP_DOWN→multiple_choice/dropdown; scale→rating_numeric; grid→matrix;
 * fileUpload→re-fetch Drive refs; pageBreak→Block.
 */
import type { TypeMap } from './index';

export const googleformsTypeMap: TypeMap = {
  // Keys = the question item's discriminator in the Forms API.
  textQuestion:                 { target: 'short_text' },          // (paragraph flag → open_text, set in transform)
  paragraphTextQuestion:        { target: 'open_text' },
  RADIO:                        { target: 'multiple_choice' },
  CHECKBOX:                     { target: 'checkbox' },
  DROP_DOWN:                    { target: 'dropdown' },
  scaleQuestion:                { target: 'rating_numeric', scaleSensitive: true },
  ratingQuestion:               { target: 'rating_stars', scaleSensitive: true },
  radioGridQuestion:            { target: 'matrix', scaleSensitive: true },
  checkboxGridQuestion:         { target: 'matrix' },
  dateQuestion:                 { target: 'date' },
  timeQuestion:                 { target: 'short_text' },
  fileUploadQuestion:           { target: 'preserve' },             // re-fetch Drive refs
  // Structural / non-question.
  pageBreakItem:                { target: 'preserve' },             // → Block
  textItem:                     { target: 'display_text' },
  imageItem:                    { target: 'display_text' },
  videoItem:                    { target: 'display_text' },
};
