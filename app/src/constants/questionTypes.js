// Question type registry — single source of truth for all 13 survey question types.

export const QTYPE_META = {
  nps:             { label: 'NPS 0–10',      icon: 'sentiment_very_satisfied', color: '#2a4bd9', bg: 'rgba(42,75,217,0.08)',   group: 'Scale',    desc: 'Net Promoter Score' },
  csat:            { label: 'CSAT 1–5',       icon: 'star',                     color: '#d97706', bg: 'rgba(217,119,6,0.08)',    group: 'Scale',    desc: 'Customer satisfaction' },
  rating:          { label: 'Rating Scale',   icon: 'linear_scale',             color: '#059669', bg: 'rgba(5,150,105,0.08)',    group: 'Scale',    desc: 'Star or number scale' },
  slider:          { label: 'Slider',         icon: 'tune',                     color: '#00647c', bg: 'rgba(0,100,124,0.08)',    group: 'Scale',    desc: 'Continuous range' },
  multiple_choice: { label: 'Single Choice',  icon: 'radio_button_checked',     color: '#8329c8', bg: 'rgba(131,41,200,0.08)',   group: 'Choice',   desc: 'Pick one option' },
  checkbox:        { label: 'Multi-Select',   icon: 'check_box',                color: '#0891b2', bg: 'rgba(8,145,178,0.08)',    group: 'Choice',   desc: 'Pick multiple' },
  dropdown:        { label: 'Dropdown',       icon: 'arrow_drop_down_circle',   color: '#7c3aed', bg: 'rgba(124,58,237,0.08)',   group: 'Choice',   desc: 'Select from list' },
  ranking:         { label: 'Ranking',        icon: 'format_list_numbered',     color: '#b45309', bg: 'rgba(180,83,9,0.08)',     group: 'Choice',   desc: 'Order by preference' },
  open_text:       { label: 'Long Text',      icon: 'subject',                  color: '#059669', bg: 'rgba(5,150,105,0.08)',    group: 'Text',     desc: 'Paragraph response' },
  short_text:      { label: 'Short Text',     icon: 'short_text',               color: '#0284c7', bg: 'rgba(2,132,199,0.08)',    group: 'Text',     desc: 'Single line input' },
  matrix:          { label: 'Matrix Grid',    icon: 'grid_on',                  color: '#6d28d9', bg: 'rgba(109,40,217,0.08)',   group: 'Advanced', desc: 'Rows × columns grid' },
  date:            { label: 'Date / Time',    icon: 'calendar_today',           color: '#0f766e', bg: 'rgba(15,118,110,0.08)',   group: 'Advanced', desc: 'Date or time picker' },
  statement:       { label: 'Statement',      icon: 'title',                    color: '#64748b', bg: 'rgba(100,116,139,0.08)',  group: 'Advanced', desc: 'Text block or divider' },
};

export const QTYPE_GROUPS = ['Scale', 'Choice', 'Text', 'Advanced'];

// Returns a fully-populated question with sensible defaults for the given type.
export function createQuestion(type) {
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const base = { id, type, question: '', required: false, skipLogic: [], displayLogic: null };
  const defaults = {
    nps:             { question: 'How likely are you to recommend us to a colleague?', required: true, labelLow: 'Not at all likely', labelHigh: 'Extremely likely' },
    csat:            { question: 'How satisfied are you with your experience?', required: true, csatStyle: 'emoji' },
    rating:          { question: 'How would you rate your experience?', scaleMax: 5, ratingStyle: 'stars', labelLow: '', labelHigh: '' },
    slider:          { question: 'Rate your overall satisfaction', min: 0, max: 10, step: 1, showValue: true, labelLow: 'Poor', labelHigh: 'Excellent' },
    multiple_choice: { question: 'Which option best describes your situation?', options: ['Option A', 'Option B', 'Option C'], allowOther: false, randomize: false },
    checkbox:        { question: 'Select all that apply', options: ['Option A', 'Option B', 'Option C'], allowOther: false, randomize: false, maxSelections: null },
    dropdown:        { question: 'Please select one', options: ['Option A', 'Option B', 'Option C'], placeholder: 'Choose an option...' },
    ranking:         { question: 'Rank these from most to least important', options: ['Item A', 'Item B', 'Item C'] },
    open_text:       { question: 'Please share your thoughts', placeholder: 'Share your thoughts...', maxLength: null },
    short_text:      { question: 'What is your name?', placeholder: 'Type here...', validation: null, maxLength: 200 },
    matrix:          { question: 'Please rate each of the following areas', rows: ['Quality', 'Speed', 'Support'], columns: ['Poor', 'Fair', 'Good', 'Excellent'], matrixType: 'radio' },
    date:            { question: 'When did this occur?', dateType: 'date' },
    statement:       { question: 'Section Title', isStatement: true },
  };
  return { ...base, ...(defaults[type] || {}) };
}

// Maps AI-generated question objects (4-type schema) → full 13-type builder schema.
export function mapAiToBuilderQuestion(q) {
  const typeMap = {
    nps: 'nps', rating: 'rating', multiple_choice: 'multiple_choice', open_text: 'open_text',
    csat: 'csat', slider: 'slider', checkbox: 'checkbox', dropdown: 'dropdown',
    ranking: 'ranking', short_text: 'short_text', matrix: 'matrix', date: 'date', statement: 'statement',
  };
  const type = typeMap[q.type] || 'open_text';
  const base = createQuestion(type);
  return {
    ...base,
    id:       q.id   || base.id,
    question: q.question || base.question,
    required: q.required ?? base.required,
    ...(q.options    && { options:   q.options   }),
    ...(q.rows       && { rows:      q.rows      }),
    ...(q.columns    && { columns:   q.columns   }),
    ...(q.labelLow   && { labelLow:  q.labelLow  }),
    ...(q.labelHigh  && { labelHigh: q.labelHigh }),
  };
}
