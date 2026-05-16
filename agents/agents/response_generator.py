"""Response Generator Agent — creates realistic synthetic survey responses.

Given a survey's questions and structure, this agent:
  1. Builds a persona distribution (promoters / passives / detractors based on persona_mix)
  2. Generates batches of realistic answers per persona
  3. Returns complete response objects ready to be inserted into the DB

Called via: POST /responses/generate (agents/main.py)
Triggered by: POST /api/surveys/:surveyId/generate-sample-responses (backend)
"""
from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field, model_validator

from agents.lib.openrouter import call_agent
from agents.lib.logger import logger


# ── I/O schemas ───────────────────────────────────────────────────────────────

class ResponseGenInput(BaseModel):
    survey_id:     str
    org_id:        str
    survey_title:  str
    survey_intent: str | None = None
    questions:     list[dict]
    count:         int    = Field(default=20, ge=1, le=100)
    persona_mix:   str    = "realistic"   # realistic | critical | positive | mixed


class GeneratedAnswer(BaseModel):
    questionId: str
    type:       str
    value:      Any  # int | str | list[str] | dict | None


class GeneratedResponse(BaseModel):
    persona:   str = ""
    nps_score: int | None = None
    answers:   list[GeneratedAnswer]

    @model_validator(mode="after")
    def _extract_nps(self) -> "GeneratedResponse":
        if self.nps_score is None:
            for a in self.answers:
                if a.type == "nps" and isinstance(a.value, (int, float)):
                    self.nps_score = int(a.value)
                    break
        return self


class ResponseGenBatch(BaseModel):
    responses: list[GeneratedResponse]


# ── Prompt building ───────────────────────────────────────────────────────────

_PERSONA_GUIDES = {
    "realistic": "~25% detractors (NPS 0-6), 35% passives (NPS 7-8), 40% promoters (NPS 9-10). Mix of frustrations and praise.",
    "critical":  "~60% detractors (NPS 0-6), 30% passives (NPS 7-8), 10% promoters. Focus on pain points, bugs, slow service.",
    "positive":  "~5% detractors, 20% passives (NPS 7-8), 75% promoters (NPS 9-10). Enthusiastic users, feature love.",
    "mixed":     "Equal spread across all NPS ranges 0-10. Highly varied feedback topics.",
}

_ANSWER_RULES = """\
ANSWER FORMAT BY QUESTION TYPE (must match exactly):
- nps:             integer 0-10
- csat:            integer 1-5
- rating:          integer from 1 to scaleMax (default 5)
- slider:          integer between min and max
- multiple_choice: exactly ONE string copied verbatim from options list
- checkbox:        JSON array of 1-3 strings from options list
- dropdown:        exactly ONE string copied verbatim from options list
- ranking:         JSON array containing ALL option strings in ranked order
- open_text:       1-3 sentences (50-200 chars), realistic and persona-appropriate
- short_text:      3-12 words matching the persona tone
- matrix:          JSON object {"row_label": "column_label"} for each row
- date:            "YYYY-MM-DD" string
- statement:       null"""


def _format_questions(questions: list[dict]) -> str:
    lines: list[str] = []
    for q in questions:
        qid   = q.get("id", "?")
        qtype = q.get("type", "open_text")
        text  = q.get("question", "")[:120]
        line  = f"  [{qid}] ({qtype}) {text}"

        if qtype in ("multiple_choice", "checkbox", "dropdown", "ranking"):
            opts = q.get("options") or []
            if opts:
                line += f"\n    OPTIONS: {json.dumps(opts)}"

        if qtype == "rating":
            line += f"  scaleMax={q.get('scaleMax', 5)}"
        if qtype == "slider":
            line += f"  min={q.get('min', 0)} max={q.get('max', 10)}"
        if qtype == "matrix":
            rows = q.get("rows") or []
            cols = q.get("columns") or []
            line += f"\n    ROWS: {json.dumps(rows)}  COLS: {json.dumps(cols)}"

        lines.append(line)
    return "\n".join(lines)


def _build_system(inp: ResponseGenInput, batch_n: int, offset: int) -> str:
    persona_guide = _PERSONA_GUIDES.get(inp.persona_mix, _PERSONA_GUIDES["realistic"])
    intent_line   = f'Survey intent: "{inp.survey_intent}"' if inp.survey_intent else ""
    questions_str = _format_questions(inp.questions)

    return f"""\
You are a survey response simulation expert. Generate {batch_n} realistic, distinct synthetic responses for the survey below.

SURVEY: "{inp.survey_title}"
{intent_line}

PERSONA MIX (for these {batch_n} responses, starting at respondent #{offset + 1}):
{persona_guide}

QUESTIONS:
{questions_str}

{_ANSWER_RULES}

RULES:
1. Every non-statement question MUST have an answer (do not skip).
2. Open-text answers must sound like a real person — use natural language, first person.
3. Match open-text sentiment to the NPS/rating score of that response.
4. Persona description should be ≤10 words (e.g. "Long-time user, frustrated with onboarding").
5. Each response must be unique — different concerns, phrasing, scores.
6. For multiple_choice / dropdown / ranking / checkbox: use ONLY strings from the provided OPTIONS list, verbatim.

Return ONLY valid JSON — no markdown, no explanation:
{{"responses": [{{"persona": "...", "nps_score": 8, "answers": [{{"questionId": "q1", "type": "nps", "value": 8}}, ...]}}]}}
"""


# ── LLM call + batch loop ─────────────────────────────────────────────────────

_BATCH_SIZE = 5   # responses per LLM call — keeps output tokens manageable on free tier


def _strip_think(raw: str) -> str:
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


async def _generate_batch(inp: ResponseGenInput, batch_n: int, offset: int) -> list[GeneratedResponse]:
    """Call the LLM for one batch, validate, return list of responses (may be empty on failure)."""
    system = _build_system(inp, batch_n, offset)
    user   = f"Generate exactly {batch_n} responses now."

    try:
        output, _ = await call_agent(
            agent_name="response_gen",
            system=system,
            user=user,
            output_schema=ResponseGenBatch,
        )
        logger.info(
            "response_gen_batch_ok",
            survey_id=inp.survey_id,
            batch_n=batch_n,
            offset=offset,
            got=len(output.responses),
        )
        return output.responses

    except Exception as exc:
        logger.warning(
            "response_gen_batch_failed",
            survey_id=inp.survey_id,
            offset=offset,
            error=str(exc)[:200],
        )
        return []


async def generate_responses(inp: ResponseGenInput) -> list[dict]:
    """
    Generate `inp.count` synthetic responses in batches.
    Returns a list of dicts ready for DB insertion:
      [{answers: [...], nps_score: int|None}]
    """
    all_responses: list[GeneratedResponse] = []
    remaining = inp.count

    while remaining > 0:
        batch_n = min(remaining, _BATCH_SIZE)
        offset  = inp.count - remaining
        batch   = await _generate_batch(inp, batch_n, offset)
        all_responses.extend(batch)
        remaining -= batch_n

    result: list[dict] = []
    for resp in all_responses:
        answers = [a.model_dump() for a in resp.answers]
        result.append({
            "answers":   answers,
            "nps_score": resp.nps_score,
            "persona":   resp.persona,
        })

    logger.info(
        "response_gen_complete",
        survey_id=inp.survey_id,
        requested=inp.count,
        generated=len(result),
    )
    return result


# ── Thin agent wrapper ────────────────────────────────────────────────────────

class ResponseGeneratorAgent:
    async def run(self, inp: ResponseGenInput) -> tuple[list[dict], list[dict]]:
        responses = await generate_responses(inp)
        return responses, []


response_generator_agent = ResponseGeneratorAgent()
