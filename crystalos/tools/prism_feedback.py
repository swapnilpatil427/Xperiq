"""Prism cross-source feedback + provenance context tools (ADR-026).

Two read-only context tools that let Crystal / the Prism skills reason across
sources and answer "where did this number come from":

  - ``get_unified_feedback`` — rows from the ``unified_feedback`` view (responses +
    review/call/ticket ``signals``, normalized) for an org, optionally scoped by
    survey / date window / topics. The ``unified_feedback`` view is the ADR-026
    cross-source layer; until it exists this tool **degrades gracefully** to the
    real ``responses`` table so it works today and lights up automatically once the
    view is created.
  - ``get_insight_sources`` — the responses/signals that backed a given insight,
    read from ``insight_response_citations`` (ADR-026 provenance). Until that table
    exists it falls back to today's provenance: the insight's ``sample_response_ids``
    / the run's ``sampled_response_ids``.

Plus a small ``enrichment_version`` awareness helper (``should_enrich`` /
``stamp_enrichment_version``) so callers can stamp/skip re-enrichment idempotently
(B6 in the I5 hardening list).

Contract (mirrors ``crystalos/crystal/tools.py`` executors):
  - org_id is REQUIRED and is on every SQL WHERE clause (tenant isolation).
  - All queries are parameterized (``%s`` placeholders) — never string-interpolated.
  - Returns ``{"error": "..."}`` on failure rather than raising.

These are registered in ``skills/plugin.json`` under ``tools`` and are also callable
directly (org_id-first). They accept the skill ``ctx``/``params`` dispatch shape too
(``crystalos/lib/tool_dispatcher.py`` calls ``fn(ctx=ctx, params=params, **params)``).
"""
from __future__ import annotations

import json
from typing import Any

from crystalos.lib import db
from crystalos.lib.logger import logger

# TODO(verify): ``unified_feedback`` (view over responses + signals),
# ``insight_response_citations`` (response→insight provenance), the ``signals``
# table, and the ``enrichment_version`` column are DESIGNED (ADR-026 / I5 / B6) but
# NOT YET in the DB (verified against supabase/ migrations + lib/db.ensure_schema as
# of 2026-06-29). Every query below probes the new shape first and falls back to the
# tables that exist today, so this module is correct now and upgrades automatically
# once the Prism migrations land. Re-point the primary queries when they do.

# Current enrichment model version. Bump when the enrichment model/prompt changes so
# the decoupled enrichment worker tier (ADR-025) re-enriches only on a version bump.
ENRICHMENT_VERSION = 1


# ── enrichment_version awareness (stamp / skip helper) ────────────────────────

def should_enrich(existing_version: Any, current_version: int = ENRICHMENT_VERSION) -> bool:
    """Return True iff a record needs (re-)enrichment.

    Idempotent stamping (B6): a record already enriched at the current version is
    skipped; a missing/older version means enrich. Keyed elsewhere by
    (response/signal id + enrichment_version) so a paused backfill resumes without
    double-charging.
    """
    if existing_version is None:
        return True
    try:
        return int(existing_version) < int(current_version)
    except (TypeError, ValueError):
        # Unparseable stamp → treat as un-enriched (safe: re-enrich rather than skip).
        return True


def stamp_enrichment_version(record: dict[str, Any], current_version: int = ENRICHMENT_VERSION) -> dict[str, Any]:
    """Return ``record`` with the current enrichment_version stamped on it.

    Pure/non-mutating helper for the enrichment worker to mark a record as enriched
    at this model version. Does not write to the DB.
    """
    out = dict(record)
    out["enrichment_version"] = current_version
    return out


# ── arg normalization (direct call + skill-dispatcher call) ───────────────────

def _resolve_org_id(org_id: str | None, ctx: Any, params: dict | None) -> str | None:
    """Resolve org_id from the direct arg, a ctx (dict or object), or params."""
    if org_id:
        return org_id
    if isinstance(params, dict) and params.get("org_id"):
        return params["org_id"]
    if isinstance(ctx, dict):
        return ctx.get("org_id")
    return getattr(ctx, "org_id", None)


def _opt(value: Any, ctx: Any, params: dict | None, key: str) -> Any:
    """Pick an optional arg from the direct value, then params, then ctx."""
    if value is not None:
        return value
    if isinstance(params, dict) and params.get(key) is not None:
        return params[key]
    if isinstance(ctx, dict):
        return ctx.get(key)
    return getattr(ctx, key, None)


def _extract_texts(answers: Any) -> list[str]:
    """Pull non-empty string answer values out of a JSON ``answers`` blob."""
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            return []
    texts: list[str] = []
    for a in (answers or []):
        if isinstance(a, dict):
            val = a.get("value")
            if isinstance(val, str) and val.strip():
                texts.append(val.strip())
    return texts


# ── get_unified_feedback ──────────────────────────────────────────────────────

async def get_unified_feedback(
    org_id: str | None = None,
    survey_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    topics: list[str] | None = None,
    limit: int = 100,
    *,
    ctx: Any = None,
    params: dict | None = None,
) -> dict[str, Any]:
    """Return normalized cross-source feedback rows (responses + signals) for an org.

    org_id is required and scopes every query. ``survey_id``, ``date_from``/``date_to``
    (ISO timestamps, filter on the source event time), and ``topics`` (match any) are
    optional filters. Reads the ``unified_feedback`` view when present, else falls back
    to ``responses``. Returns ``{"items": [...], "count": int, "source": "unified_feedback"|"responses"}``.
    """
    org_id = _resolve_org_id(org_id, ctx, params)
    survey_id = _opt(survey_id, ctx, params, "survey_id")
    date_from = _opt(date_from, ctx, params, "date_from")
    date_to = _opt(date_to, ctx, params, "date_to")
    topics = _opt(topics, ctx, params, "topics")
    if isinstance(params, dict) and params.get("limit") is not None:
        limit = params["limit"]
    if not org_id:
        return {"error": "org_id required"}
    try:
        limit = max(1, min(int(limit), 500))
    except (TypeError, ValueError):
        limit = 100

    # ── Primary: unified_feedback view (responses + signals) ──────────────────
    try:
        conditions = ["org_id = %s"]
        args: list[Any] = [org_id]
        if survey_id:
            conditions.append("survey_id = %s")
            args.append(survey_id)
        if date_from:
            conditions.append("source_observed_at >= %s")
            args.append(date_from)
        if date_to:
            conditions.append("source_observed_at <= %s")
            args.append(date_to)
        if topics:
            conditions.append("topics_text ILIKE ANY(%s)")
            args.append([f"%{t}%" for t in topics])
        args.append(limit)
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"""SELECT source_type, source_record_id, survey_id, contact_id,
                               rating, sentiment, sentiment_score, raw_text, topics_text,
                               source_observed_at
                        FROM unified_feedback
                        WHERE {' AND '.join(conditions)}
                        ORDER BY source_observed_at DESC NULLS LAST
                        LIMIT %s""",
                    args,
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
        items = []
        for row in rows:
            item = dict(zip(cols, row))
            for k in ("source_observed_at",):
                if item.get(k) is not None:
                    item[k] = str(item[k])
            if item.get("sentiment_score") is not None:
                item["sentiment_score"] = float(item["sentiment_score"])
            items.append(item)
        return {"items": items, "count": len(items), "source": "unified_feedback"}
    except Exception as exc:
        # View not present yet (expected pre-Prism-migration) — fall back to responses.
        logger.debug("unified_feedback_view_unavailable_fallback_responses", error=str(exc))

    # ── Fallback: responses table (survey responses only — no signals yet) ────
    try:
        conditions = ["org_id = %s", "deleted_at IS NULL"]
        args = [org_id]
        if survey_id:
            conditions.append("survey_id = %s")
            args.append(survey_id)
        if date_from:
            conditions.append("submitted_at >= %s")
            args.append(date_from)
        if date_to:
            conditions.append("submitted_at <= %s")
            args.append(date_to)
        if topics:
            conditions.append("ai_topics::text ILIKE ANY(%s)")
            args.append([f"%{t}%" for t in topics])
        args.append(limit)
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"""SELECT id, survey_id, contact_id, nps_score,
                               ai_sentiment, ai_sentiment_score, answers, ai_topics,
                               submitted_at
                        FROM responses
                        WHERE {' AND '.join(conditions)}
                        ORDER BY submitted_at DESC NULLS LAST
                        LIMIT %s""",
                    args,
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
        items = []
        for row in rows:
            r = dict(zip(cols, row))
            texts = _extract_texts(r.get("answers"))
            items.append({
                "source_type": "survey_response",
                "source_record_id": str(r.get("id")),
                "survey_id": str(r.get("survey_id")) if r.get("survey_id") else None,
                "contact_id": r.get("contact_id"),
                "rating": int(r["nps_score"]) if r.get("nps_score") is not None else None,
                "sentiment": r.get("ai_sentiment"),
                "sentiment_score": float(r["ai_sentiment_score"]) if r.get("ai_sentiment_score") is not None else None,
                "raw_text": texts[0][:400] if texts else None,
                "topics_text": r.get("ai_topics"),
                "source_observed_at": str(r["submitted_at"]) if r.get("submitted_at") else None,
            })
        return {"items": items, "count": len(items), "source": "responses"}
    except Exception as exc:
        logger.error("get_unified_feedback_failed", error=str(exc), org_id=org_id)
        return {"error": str(exc)}


# ── get_insight_sources ───────────────────────────────────────────────────────

async def get_insight_sources(
    org_id: str | None = None,
    insight_id: str | None = None,
    limit: int = 50,
    *,
    ctx: Any = None,
    params: dict | None = None,
) -> dict[str, Any]:
    """Return the responses/signals that backed an insight ("where did this number come from").

    org_id is required and scopes every query. Reads ``insight_response_citations``
    (ADR-026 provenance) when present, else falls back to the insight's
    ``sample_response_ids`` and the producing run's ``sampled_response_ids``.
    Returns ``{"insight_id", "sources": [...], "count", "provenance": <table used>}``.
    """
    org_id = _resolve_org_id(org_id, ctx, params)
    insight_id = _opt(insight_id, ctx, params, "insight_id")
    if isinstance(params, dict) and params.get("limit") is not None:
        limit = params["limit"]
    if not org_id:
        return {"error": "org_id required"}
    if not insight_id:
        return {"error": "insight_id required"}
    try:
        limit = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit = 50

    # ── Primary: insight_response_citations provenance table ──────────────────
    try:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT response_id, source_type, source_record_id,
                              snippet, weight
                       FROM insight_response_citations
                       WHERE insight_id = %s AND org_id = %s
                       LIMIT %s""",
                    (insight_id, org_id, limit),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
        if rows:
            sources = []
            for row in rows:
                s = dict(zip(cols, row))
                if s.get("response_id") is not None:
                    s["response_id"] = str(s["response_id"])
                if s.get("weight") is not None:
                    s["weight"] = float(s["weight"])
                sources.append(s)
            return {
                "insight_id": insight_id,
                "sources": sources,
                "count": len(sources),
                "provenance": "insight_response_citations",
            }
    except Exception as exc:
        logger.debug("insight_response_citations_unavailable_fallback", error=str(exc))

    # ── Fallback: insight.sample_response_ids → run.sampled_response_ids ───────
    try:
        response_ids: list[str] = []
        provenance = "insight.sample_response_ids"
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT sample_response_ids, run_id
                       FROM insights
                       WHERE id = %s AND org_id = %s
                       LIMIT 1""",
                    (insight_id, org_id),
                )
                row = await cur.fetchone()
                if row is None:
                    return {"error": "insight not found"}
                sample_ids, run_id = row[0], row[1]
                if isinstance(sample_ids, str):
                    try:
                        sample_ids = json.loads(sample_ids)
                    except Exception:
                        sample_ids = []
                response_ids = [str(x) for x in (sample_ids or [])][:limit]

                # Fall through to the producing run's sampled set if the insight has none.
                if not response_ids and run_id is not None:
                    provenance = "agent_runs.sampled_response_ids"
                    await cur.execute(
                        """SELECT sampled_response_ids
                           FROM agent_runs
                           WHERE id = %s AND org_id = %s
                           LIMIT 1""",
                        (run_id, org_id),
                    )
                    run_row = await cur.fetchone()
                    if run_row and run_row[0]:
                        run_ids = run_row[0]
                        if isinstance(run_ids, str):
                            try:
                                run_ids = json.loads(run_ids)
                            except Exception:
                                run_ids = []
                        response_ids = [str(x) for x in (run_ids or [])][:limit]

        sources = [{"response_id": rid, "source_type": "survey_response"} for rid in response_ids]
        return {
            "insight_id": insight_id,
            "sources": sources,
            "count": len(sources),
            "provenance": provenance,
        }
    except Exception as exc:
        logger.error("get_insight_sources_failed", error=str(exc), org_id=org_id, insight_id=insight_id)
        return {"error": str(exc)}
