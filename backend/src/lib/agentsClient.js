/**
 * HTTP client for the Experient Copilot Agents microservice (Python/FastAPI).
 *
 * The agents service runs on AGENTS_URL (default: http://localhost:8001).
 * All requests include the shared internal key for service-to-service auth.
 *
 * This client is the ONLY place in the Node.js backend that talks to the agents
 * service — no other module should call the agents API directly.
 */
const fetch  = require('node-fetch');
const logger = require('./logger');

const AGENTS_URL          = process.env.AGENTS_URL          || 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY || 'dev-internal-key-change-in-prod';

// Fast timeout: non-LLM operations (status polls, CRUD edits, registry)
const DEFAULT_TIMEOUT_MS = 12_000;
// LLM timeout: full model inference (copilot refine, skip-logic, recommendations).
// Free-tier models can take 15–30s; retry-after backoff adds up to ~8s per attempt.
// 90s covers one full inference + one rate-limit retry without blocking the request forever.
const LLM_TIMEOUT_MS = 90_000;

function _headers() {
  return {
    'Content-Type':   'application/json',
    'X-Internal-Key': AGENTS_INTERNAL_KEY,
  };
}

async function _fetch(path, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENTS_URL}${path}`, {
      ...opts,
      signal:  controller.signal,
      headers: { ..._headers(), ...(opts.headers || {}) },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw Object.assign(
        new Error(`Agents service error ${res.status}: ${body}`),
        { status: res.status },
      );
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Response generation: ceil(count/5) LLM batches × ~15s each + 30s buffer, capped at 5 min.
function _responseGenTimeout(count) {
  return Math.min(Math.ceil(count / 5) * 15_000 + 30_000, 300_000);
}


// ── Survey creation ──────────────────────────────────────────────────────────────

/**
 * Start a survey creation orchestration run (async — returns run_id immediately).
 */
async function startOrchestration({
  orgId, userId, intent, surveyTypeId, sessionId,
  orgContext = {}, sessionActions = [], surveyHistory = [],
}) {
  logger.info({ orgId, intent: intent.slice(0, 60) }, 'agents:startOrchestration');
  return _fetch('/orchestrate', {
    method: 'POST',
    body: JSON.stringify({
      org_id:          orgId,
      user_id:         userId,
      intent,
      survey_type_id:  surveyTypeId   || null,
      session_id:      sessionId      || null,
      org_context:     orgContext,
      session_actions: sessionActions,
      survey_history:  surveyHistory,
    }),
  });
}

/**
 * Poll the status of a running orchestration.
 * Returns { run_id, status, questions, qc_score, recommendations, stream_events, ... }
 */
async function getRunStatus(runId, orgId) {
  return _fetch(`/orchestrate/${runId}/status?org_id=${encodeURIComponent(orgId)}`);
}

/**
 * Cancel a running orchestration. Stops the in-process asyncio task (if still live)
 * and marks the DB record as 'cancelled'. Idempotent — safe to call on already-
 * terminal runs; returns the current status without error.
 * Returns { run_id, status, task_cancelled }
 */
async function cancelOrchestration(runId, orgId) {
  logger.info({ runId, orgId }, 'agents:cancelOrchestration');
  return _fetch(`/orchestrate/${runId}/cancel?org_id=${encodeURIComponent(orgId)}`, {
    method: 'POST',
  });
}


// ── Copilot chat edits ────────────────────────────────────────────────────────────

/**
 * Apply a natural-language edit to survey questions via the Copilot agent.
 * @param {string} runId
 * @param {object} params
 * @param {string}   params.orgId
 * @param {string}   params.message        - user's chat message
 * @param {object}   [params.orgContext]
 * @param {string}   [params.surveyTypeId]
 * @param {string}   [params.intent]       - original survey creation intent
 * @returns {Promise<{ questions, explanation, changes, suggestions }>}
 */
async function refineRun(runId, { orgId, message, questions, orgContext = {}, surveyTypeId, intent = '', conversationHistory = [] }) {
  logger.info({ runId, orgId, message: message.slice(0, 60) }, 'agents:refineRun');
  return _fetch(`/orchestrate/${runId}/refine`, {
    method: 'POST',
    body: JSON.stringify({
      org_id:               orgId,
      message,
      questions:            questions || null,
      org_context:          orgContext,
      survey_type_id:       surveyTypeId || null,
      intent,
      conversation_history: conversationHistory,
    }),
  }, LLM_TIMEOUT_MS);
}


// ── Skip logic ────────────────────────────────────────────────────────────────────

/**
 * Add conditional skip/display logic to survey questions.
 * @param {string} runId
 * @param {object} params
 * @param {string}   params.orgId
 * @param {string}   params.request     - plain-English: "if NPS < 7 ask why"
 * @param {object}   [params.orgContext]
 * @returns {Promise<{ questions, changes, message }>}
 */
async function addSkipLogic(runId, { orgId, request, orgContext = {} }) {
  logger.info({ runId, orgId }, 'agents:addSkipLogic');
  return _fetch(`/orchestrate/${runId}/skip-logic`, {
    method: 'POST',
    body: JSON.stringify({ org_id: orgId, request, org_context: orgContext }),
  }, LLM_TIMEOUT_MS);
}


// ── Question CRUD ─────────────────────────────────────────────────────────────────

/**
 * Add a new question to the survey.
 * @param {string} runId
 * @param {object} params
 * @param {string}   params.orgId
 * @param {string}   [params.type]      - question type (default: "open_text")
 * @param {string}   [params.afterId]   - insert after this question ID
 * @returns {Promise<{ questions, message, changes }>}
 */
async function addQuestion(runId, { orgId, type = 'open_text', afterId = null }) {
  return _fetch(`/orchestrate/${runId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ org_id: orgId, type, after_id: afterId }),
  });
}

/**
 * Remove a question from the survey.
 * Also removes any skip logic rules that reference the deleted question.
 */
async function removeQuestion(runId, qId, orgId) {
  return _fetch(`/orchestrate/${runId}/questions/${qId}?org_id=${encodeURIComponent(orgId)}`, {
    method: 'DELETE',
  });
}

/**
 * Update specific fields on a question (does not change ID or type via patch — use refineRun for that).
 * @param {string} runId
 * @param {string} qId
 * @param {object} params
 * @param {string}   params.orgId
 * @param {object}   params.fields   - partial question fields to apply
 */
async function patchQuestion(runId, qId, { orgId, fields }) {
  return _fetch(`/orchestrate/${runId}/questions/${qId}`, {
    method: 'PATCH',
    body: JSON.stringify({ org_id: orgId, fields }),
  });
}

/**
 * Reorder questions by providing a new ordered list of IDs.
 * IDs not included will be appended at the end.
 */
async function reorderQuestions(runId, { orgId, order }) {
  return _fetch(`/orchestrate/${runId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ org_id: orgId, order }),
  });
}


// ── Recommendation dispatcher ──────────────────────────────────────────────────

/**
 * Execute a recommendation action (adds skip logic, refines a question, adds follow-up, etc.).
 * @param {string} runId
 * @param {string} actionId   - recommendation action ID (e.g. "add_skip_logic")
 * @param {object} params
 * @param {string}   params.orgId
 * @param {object}   [params.parameters]    - action-specific parameters
 * @param {object}   [params.orgContext]
 * @param {string}   [params.surveyTypeId]
 * @param {string}   [params.intent]
 */
async function applyRecommendation(runId, actionId, {
  orgId, parameters = {}, orgContext = {}, surveyTypeId, intent = '',
}) {
  logger.info({ runId, orgId, actionId }, 'agents:applyRecommendation');
  return _fetch(`/orchestrate/${runId}/apply-recommendation/${actionId}`, {
    method: 'POST',
    body: JSON.stringify({
      org_id:         orgId,
      parameters,
      org_context:    orgContext,
      survey_type_id: surveyTypeId || null,
      intent,
    }),
  }, LLM_TIMEOUT_MS);
}


// ── Sample response generation ─────────────────────────────────────────────────

/**
 * Generate synthetic sample responses for a survey.
 * @param {object} params
 * @param {string}   params.surveyId
 * @param {string}   params.orgId
 * @param {string}   params.surveyTitle
 * @param {string}   [params.surveyIntent]
 * @param {Array}    params.questions       - survey question objects
 * @param {number}   [params.count]         - number of responses (default 20)
 * @param {string}   [params.personaMix]    - "realistic" | "critical" | "positive" | "mixed"
 * @returns {Promise<{ responses: Array, count: number }>}
 */
async function generateSampleResponses({
  surveyId, orgId, surveyTitle, surveyIntent, questions, count = 20, personaMix = 'realistic',
}) {
  const timeoutMs = _responseGenTimeout(count);
  logger.info({ surveyId, orgId, count, personaMix, timeoutMs }, 'agents:generateSampleResponses');
  return _fetch('/responses/generate', {
    method: 'POST',
    body: JSON.stringify({
      survey_id:     surveyId,
      org_id:        orgId,
      survey_title:  surveyTitle,
      survey_intent: surveyIntent || null,
      questions,
      count,
      persona_mix:   personaMix,
    }),
  }, timeoutMs);
}


// ── Insight generation ─────────────────────────────────────────────────────────

/**
 * Fire insight generation for a survey. Best-effort; caller should not await
 * the full pipeline — only the HTTP kick-off.
 *
 * @param {{ surveyId, orgId, runId, trigger }} params
 */
async function triggerInsightGeneration({ surveyId, orgId, runId, trigger = 'manual' }) {
  logger.info({ surveyId, orgId, runId, trigger }, 'agents:triggerInsightGeneration');
  return _fetch('/insights/generate', {
    method: 'POST',
    body: JSON.stringify({ survey_id: surveyId, org_id: orgId, run_id: runId, trigger }),
  }, 15_000);
}


// ── Registry + health ──────────────────────────────────────────────────────────

/** List all agent capabilities (active + stubs). */
async function getAgentRegistry() {
  return _fetch('/agents/registry');
}

/** Returns true if the agents service is reachable. */
async function isHealthy() {
  try {
    await fetch(`${AGENTS_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}


module.exports = {
  // Orchestration
  startOrchestration,
  getRunStatus,
  cancelOrchestration,
  // Copilot chat
  refineRun,
  // Skip logic
  addSkipLogic,
  // Question CRUD
  addQuestion,
  removeQuestion,
  patchQuestion,
  reorderQuestions,
  // Recommendation
  applyRecommendation,
  // Sample responses
  generateSampleResponses,
  // Insight generation
  triggerInsightGeneration,
  // Discovery
  getAgentRegistry,
  isHealthy,
};
