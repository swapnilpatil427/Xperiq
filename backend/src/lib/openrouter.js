const fetch = require('node-fetch');
const logger = require('./logger');
const { aiDuration, aiTotal, aiTokensTotal } = require('./metrics');

const BASE_URL = 'https://openrouter.ai/api/v1';

// Model selection mirrors the agents service AGENTS_ENV tiers.
// dev + dev-paid → Gemini 2.5 Flash (fast, cheap, no free-tier rate limits).
// staging + prod → Gemini 2.0 Flash (stable GA model for backend AI ops).
const _MODEL_MAP = {
  'dev':      'google/gemini-2.5-flash',
  'dev-paid': 'google/gemini-2.5-flash',
  'staging':  'google/gemini-2.0-flash',
  'prod':     'google/gemini-2.0-flash',
};
const DEFAULT_MODEL = _MODEL_MAP[process.env.AGENTS_ENV] ?? 'google/gemini-2.5-flash';

// Rough cost table (USD per 1k tokens, blended input+output)
const COST_PER_1K = {
  'gemini-2.5-flash': 0.0003,
  'gemini-2.0-flash': 0.0002,
  'gpt-4o-mini':      0.00015,
};

async function chat(messages, model = DEFAULT_MODEL, operation = 'chat') {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const shortModel = model.split('/').pop();
  const start = process.hrtime.bigint();

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://experient.app',
        'X-Title': 'Experient',
      },
      body: JSON.stringify({ model, messages, max_tokens: 1500 }),
    });

    if (!res.ok) {
      const err = await res.text();
      aiTotal.inc({ model: shortModel, operation, status: 'error' });
      throw new Error(`OpenRouter ${res.status}: ${err}`);
    }

    const data     = await res.json();
    const durationS = Number(process.hrtime.bigint() - start) / 1e9;

    aiDuration.observe({ model: shortModel, operation }, durationS);
    aiTotal.inc({ model: shortModel, operation, status: 'success' });

    const usage = data.usage || {};
    if (usage.prompt_tokens)     aiTokensTotal.inc({ model: shortModel, direction: 'input'  }, usage.prompt_tokens);
    if (usage.completion_tokens) aiTokensTotal.inc({ model: shortModel, direction: 'output' }, usage.completion_tokens);

    const estCost = ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0))
      / 1000 * (COST_PER_1K[shortModel] ?? 0);

    logger.info({
      model: shortModel,
      operation,
      ms:        Math.round(durationS * 1000),
      tokensIn:  usage.prompt_tokens,
      tokensOut: usage.completion_tokens,
      costUsd:   estCost ? estCost.toFixed(6) : '0 (free)',
    }, 'AI request');

    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    const durationS = Number(process.hrtime.bigint() - start) / 1e9;
    aiTotal.inc({ model: shortModel, operation, status: 'error' });
    logger.error({ model: shortModel, operation, ms: Math.round(durationS * 1000), err: err.message }, 'AI request failed');
    throw err;
  }
}

async function generateSurveyQuestions(intent, surveyTypeId) {
  const typeHint = surveyTypeId ? ` The survey type is: ${surveyTypeId}.` : '';
  const content = await chat(
    [
      {
        role: 'system',
        content: 'You are an expert enterprise survey designer. Generate exactly 5 targeted survey questions as a JSON array. Each item: { "id": "q1", "type": "nps"|"rating"|"multiple_choice"|"open_text", "question": "...", "options": [...] (for multiple_choice only), "required": true|false }. Return ONLY valid JSON array, no markdown, no explanation.',
      },
      { role: 'user', content: `Create a survey for this goal: ${intent}${typeHint}` },
    ],
    DEFAULT_MODEL,
    'generate-survey'
  );
  try {
    return JSON.parse(content.trim());
  } catch {
    throw new Error('AI returned invalid JSON for survey generation. Please retry.');
  }
}

async function analyzeInsights(surveyTitle, responses) {
  const sample = responses.slice(0, 30).map((r) => ({
    nps:     r.npsScore ?? r.nps_score,
    answers: Array.isArray(r.answers)
      ? r.answers.map((a) => a.value).filter(Boolean).join(' | ')
      : '',
  }));

  const content = await chat(
    [
      {
        role: 'system',
        content: 'You are an expert customer experience analyst. Analyze survey responses and return a JSON object: { "summary": "2-3 sentence executive summary", "npsScore": number, "topics": [{ "name": "...", "sentiment": "positive"|"neutral"|"negative", "volume": number, "phrases": ["phrase1","phrase2","phrase3"] }], "sentimentBreakdown": { "positive": number, "neutral": number, "negative": number }, "topPhrases": ["phrase1","phrase2","phrase3","phrase4","phrase5"] }. Percentages in sentimentBreakdown must sum to 100. Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: `Survey: "${surveyTitle}"\n\nResponses (${responses.length} total, showing ${sample.length}):\n${JSON.stringify(sample)}`,
      },
    ],
    DEFAULT_MODEL,
    'analyze-insights'
  );
  try {
    return JSON.parse(content.trim());
  } catch {
    throw new Error('AI returned invalid JSON for insights analysis. Please retry.');
  }
}

async function refineSurveyQuestions(questions, message, context = {}) {
  const system = `You are an expert enterprise survey designer helping a user iteratively refine their survey.
Make ONLY the changes the user requests. Keep all other questions exactly as they are.

Supported types: nps, csat, rating, slider, multiple_choice, checkbox, dropdown, ranking, open_text, short_text, matrix, date, statement

Full schema per question:
{ id, type, question, required,
  labelLow, labelHigh,                     // nps / rating / slider
  csatStyle: "emoji"|"stars"|"numbers",    // csat
  scaleMax: 5|7|10, ratingStyle: "stars"|"numbers",  // rating
  min, max, step, showValue,               // slider
  options: string[],                       // multiple_choice / checkbox / dropdown / ranking
  allowOther, randomize, maxSelections,    // choice types
  placeholder, maxLength, validation,      // text types
  rows: string[], columns: string[], matrixType: "radio"|"checkbox",  // matrix
  dateType: "date"|"time"|"datetime",      // date
  skipLogic: [{ id, condition: { operator: "eq"|"neq"|"lt"|"gt"|"lte"|"gte"|"contains"|"answered"|"not_answered", value }, destination: "<questionId>"|"END_SURVEY" }],
  displayLogic: { sourceQuestionId, operator, value } | null }

Return ONLY valid JSON — no markdown:
{ "questions": [...complete updated array...], "explanation": "one sentence of what changed" }`;

  const content = await chat(
    [
      { role: 'system', content: system },
      { role: 'user',   content: `Survey type: ${context.surveyTypeId || 'general'}\nGoal: ${context.intent || ''}\n\nCurrent questions:\n${JSON.stringify(questions, null, 2)}\n\nChange request: "${message}"` },
    ],
    DEFAULT_MODEL,
    'refine-survey'
  );

  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON for survey refinement. Please retry.');
  }
}

module.exports = { generateSurveyQuestions, analyzeInsights, refineSurveyQuestions };
