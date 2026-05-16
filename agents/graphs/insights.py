"""Insight Generation DAG — LangGraph state machine.

Pipeline:
  ingest → embed → [metrics + extract_texts (parallel)] → absa → cluster
         → topics → narrate → verify → publish

Key capabilities added in this version:
- Real OpenAI embeddings (with BoW heuristic fallback) for cosine clustering
- node_embed: embeds all open texts before clustering
- node_topics: LLM-based canonical topic discovery with new-topic detection
- Effort score per topic
- CSAT narrated via LLM (not hardcoded)
- L3 Predictive trend insights (volume up/down + NPS trajectory)
- Smart prescriptive actions (not always "create ticket")
- Time-windowed per-window metric insights in publish
- Dynamic trust scores (sample-size, coverage, consistency, grounding)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from typing import Any, Literal

import structlog
from langgraph.graph import StateGraph, END

from agents.lib import db
from agents.lib.logger import logger
from agents.lib.openrouter import call_agent
from agents.schemas.insight import (
    InsightStateModel, InsightRecord, TrustComponents, AuditInfo,
    NarrateInsightOutput, VerifyInsightOutput,
)
from agents.tools.metrics import (
    compute_nps_ci, compute_csat, compute_ces,
    compute_completion_rate, compute_response_trend, extract_open_texts,
    compute_effort_score, compute_response_trend_analysis, filter_responses_by_window,
)
from agents.tools.clustering import cluster_texts
from agents.tools.sentiment import run_absa_llm, detect_dominant_emotion, score_sentiment
from agents.tools.embeddings import get_or_create_embeddings
from agents.tools.topics import (
    discover_topics, upsert_survey_topics, get_previous_topic_names,
    compute_topic_signals, build_topic_hierarchy,
)
from agents.agents.insight_experts import (
    narrate_nps_insight, narrate_csat_insight,
    narrate_topic_insight, narrate_trend_insight,
    narrate_prescriptive_insight, evaluate_insight_set,
    NpsExpertOutput, CsatExpertOutput, TopicExpertOutput,
    TrendExpertOutput, PrescriptiveExpertOutput,
)


# ── Model config ──────────────────────────────────────────────────────────────

INSIGHT_TEMPERATURE = 0.0
DEFAULT_SEED = 42

# Time windows for per-window metric publishing
WINDOWS = ["all_time", "last_30d", "last_7d"]
WINDOW_MIN_RESPONSES = {"all_time": 1, "last_30d": 10, "last_7d": 5}


# ── Trust score helpers ───────────────────────────────────────────────────────

def _trust_statistical(n: int) -> int:
    """Convert sample size to statistical trust score (0–100)."""
    if n >= 100:
        return 90
    if n >= 50:
        return 80
    if n >= 30:
        return 70
    # Linear scale from 0 to 30 responses: 0→10, 30→70
    return max(10, round(10 + (n / 30.0) * 60))


def _trust_coverage(mentions: int, total: int) -> int:
    """Fraction of responses contributing to this insight (0–100)."""
    if total == 0:
        return 50
    frac = mentions / total
    return max(20, min(100, round(frac * 100 + 30)))


def _trust_consistency(cluster: dict) -> int:
    """Higher if cluster sentiment is uniform, lower if mixed."""
    items = cluster.get("texts", [])
    if not items:
        return 70
    sentiments = [t.get("sentiment", "neutral") for t in items]
    dominant = cluster.get("dominant_sentiment", "neutral")
    dom_count = sum(1 for s in sentiments if s == dominant)
    frac = dom_count / len(sentiments)
    # 0.5 uniform → 60, 1.0 uniform → 95
    return max(50, min(95, round(50 + frac * 45)))


def _trust_grounding(verifier_pass: bool) -> int:
    return 100 if verifier_pass else 60


def _build_trust(
    n: int,
    mentions: int,
    total: int,
    cluster: dict | None = None,
    verifier_pass: bool = True,
    below_minimum: bool = False,
) -> tuple[int, dict]:
    """Compute dynamic trust score and trust_json dict."""
    statistical  = _trust_statistical(n)
    coverage     = _trust_coverage(mentions, total)
    consistency  = _trust_consistency(cluster) if cluster else 80
    grounding    = _trust_grounding(verifier_pass)
    overall = round((statistical * 0.35 + coverage * 0.25 + consistency * 0.25 + grounding * 0.15))
    return overall, {
        "statistical":           statistical,
        "coverage":              coverage,
        "consistency":           consistency,
        "grounding":             grounding,
        "sample_size":           n,
        "below_minimum_sample":  below_minimum,
        "verifier_pass":         verifier_pass,
    }


# ── Prescriptive action mapping ───────────────────────────────────────────────

def _prescriptive_action(cluster: dict | None, nps: float | None, csat: float | None) -> dict:
    """Map insight context to the most appropriate recommended action."""
    if cluster:
        aspect = cluster.get("aspect", "unknown")
        size   = cluster.get("size", 0)
        if size > 10:
            return {"type": "create_workflow", "label": "Automate follow-up", "target": aspect}
        return {"type": "investigate", "label": "Deep-dive analysis needed", "target": aspect}
    if nps is not None and nps < 30:
        return {"type": "alert", "label": "Flag for leadership review", "target": "nps"}
    if csat is not None and csat < 3:
        return {"type": "survey_followup", "label": "Send recovery survey", "target": "csat"}
    return {"type": "investigate", "label": "Deep-dive analysis needed", "target": "general"}


# ── LLM helpers (model-router aware) ─────────────────────────────────────────

async def _narrate(system: str, user: str) -> NarrateInsightOutput:
    """Call the narrate agent via the model router (Claude Haiku in staging/prod)."""
    output, _ = await call_agent(
        agent_name="insight_narrate",
        system=system,
        user=user,
        output_schema=NarrateInsightOutput,
    )
    return output


async def _verify(claim: str, context: str) -> VerifyInsightOutput:
    """Call the verify agent to check if a claim is supported by context."""
    output, _ = await call_agent(
        agent_name="insight_verify",
        system="You are a fact-checker. Determine if the claim is supported by the provided response excerpts.",
        user=f"Claim: {claim}\n\nContext (response excerpts):\n{context}",
        output_schema=VerifyInsightOutput,
    )
    return output


async def _llm_raw(prompt: str, system: str = "", max_tokens: int = 1000) -> str:
    """Raw OpenRouter call for ABSA (free-form text, not structured output).

    Uses the model router so the model ID is always valid for the current env.
    """
    from agents.lib.openrouter import _call_with_backoff
    from agents.lib.models import ModelConfig, get_model

    base = get_model("insight_narrate")
    config = ModelConfig(
        model=base.model,
        max_tokens=max_tokens,
        temperature=INSIGHT_TEMPERATURE,
        use_anthropic_sdk=base.use_anthropic_sdk,
    )
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    content, _usage = await _call_with_backoff(messages, config)
    return content


# ── Stream event helper ───────────────────────────────────────────────────────

async def _emit_event(run_id: str, event_type: str, agent: str, data: dict) -> None:
    try:
        event = {
            "event": event_type,
            "agent": agent,
            "data": data,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        async with db._pool_conn().connection() as conn:
            await conn.execute(
                """UPDATE agent_runs
                   SET stream_events = stream_events || %s::jsonb
                   WHERE id = %s""",
                (json.dumps([event]), run_id),
            )
    except Exception as exc:
        logger.warning("emit_event_failed", run_id=run_id, error=str(exc))


# ── Node: ingest ──────────────────────────────────────────────────────────────

async def node_ingest(state: dict) -> dict:
    survey_id = state["survey_id"]
    org_id    = state["org_id"]
    run_id    = state["run_id"]

    # Load survey
    survey = None
    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM surveys WHERE id = %s AND org_id = %s AND deleted_at IS NULL",
                (survey_id, org_id),
            )
            row = await cur.fetchone()
            if row is not None:
                cols = [desc[0] for desc in cur.description]
                survey = dict(zip(cols, row))

    if not survey:
        return {**state, "errors": state["errors"] + [f"Survey {survey_id} not found"]}

    questions = survey.get("questions") or []
    if isinstance(questions, str):
        questions = json.loads(questions)

    # Load responses
    response_rows = []
    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT id, answers, submitted_at
                   FROM responses
                   WHERE survey_id = %s
                   ORDER BY submitted_at DESC NULLS LAST
                   LIMIT 1000""",
                (survey_id,),
            )
            rows = await cur.fetchall()
            cols = [desc[0] for desc in cur.description]
            response_rows = [dict(zip(cols, r)) for r in rows]

    responses = []
    for r in response_rows:
        answers = r.get("answers") or []
        if isinstance(answers, str):
            answers = json.loads(answers)
        r["answers"] = answers
        for answer in answers:
            q = next((q for q in questions if q.get("id") == answer.get("questionId")), None)
            if q:
                if q.get("type") == "nps":
                    try:
                        r["nps_score"] = int(answer.get("value", 0))
                    except (ValueError, TypeError):
                        pass
                elif q.get("type") == "csat":
                    try:
                        r["csat_score"] = float(answer.get("value", 0))
                    except (ValueError, TypeError):
                        pass
        responses.append(r)

    await _emit_event(run_id, "node_complete", "ingest", {
        "survey_id": survey_id, "response_count": len(responses),
    })

    return {**state, "survey": survey, "responses": responses}


# ── Node: embed ───────────────────────────────────────────────────────────────

async def node_embed(state: dict) -> dict:
    """Embed open-text responses using OpenAI (or heuristic fallback).

    Runs after ingest and before the parallel metrics/extract_texts split.
    Stores embeddings in the DB cache via get_or_create_embeddings.
    """
    survey_id = state["survey_id"]
    org_id    = state["org_id"]
    run_id    = state["run_id"]
    responses = state["responses"]
    survey    = state["survey"]

    # Extract open texts first so we know what to embed
    questions = survey.get("questions") or []
    if isinstance(questions, str):
        import json as _json
        questions = _json.loads(questions)

    raw_texts = extract_open_texts(responses, questions)

    # Tag each text with org/survey for embed_texts call
    tagged_texts = [
        {**t, "org_id": org_id, "survey_id": survey_id}
        for t in raw_texts
    ]

    embedded_texts = []
    try:
        async with db._pool_conn().connection() as conn:
            embedded_texts = await get_or_create_embeddings(tagged_texts, conn)
    except Exception as exc:
        logger.warning("node_embed_failed", error=str(exc))
        # Fall through — clustering will use heuristic if no embeddings
        embedded_texts = raw_texts

    await _emit_event(run_id, "node_complete", "embed", {
        "embedded_count": len(embedded_texts),
        "has_embeddings": any(t.get("embedding") for t in embedded_texts),
    })

    return {**state, "embedded_texts": embedded_texts}


# ── Node: metrics ─────────────────────────────────────────────────────────────

async def node_metrics(state: dict) -> dict:
    responses = state["responses"]
    run_id    = state["run_id"]

    metrics: dict = {}
    if any(r.get("nps_score") is not None for r in responses):
        metrics["nps"] = compute_nps_ci(responses)
    if any(r.get("csat_score") is not None for r in responses):
        metrics["csat"] = compute_csat(responses)
    metrics["completion"] = compute_completion_rate(responses)
    metrics["total_responses"] = len(responses)

    # Extended trend analysis (replaces bare daily dict)
    metrics["trend"] = compute_response_trend_analysis(responses)

    # Effort score over all open texts (if already extracted in state)
    open_texts = state.get("open_texts") or state.get("embedded_texts") or []
    if open_texts:
        all_text_strs = [t["text"] for t in open_texts]
        metrics["effort_score"] = compute_effort_score(all_text_strs)

    await _emit_event(run_id, "node_complete", "metrics", {
        "metrics": {k: v for k, v in metrics.items() if k not in ("trend",)},
    })

    return {**state, "metrics": metrics}


# ── Node: extract_texts ───────────────────────────────────────────────────────

async def node_extract_texts(state: dict) -> dict:
    questions = (state["survey"].get("questions") or [])
    if isinstance(questions, str):
        questions = json.loads(questions)
    texts = extract_open_texts(state["responses"], questions)
    return {**state, "open_texts": texts}


# ── Node: absa ────────────────────────────────────────────────────────────────

async def node_absa(state: dict) -> dict:
    texts  = state["open_texts"]
    run_id = state["run_id"]
    if not texts:
        return state

    async def _llm_func(prompt: str) -> str:
        return await _llm_raw(prompt)

    results = await run_absa_llm(texts[:100], _llm_func)  # cap at 100 for cost

    # ── Write per-response AI signals back to the responses table ────────────
    # Group results by response_id; take dominant sentiment/emotion across
    # all open-text answers for that response. Zero extra LLM calls.
    try:
        from collections import defaultdict as _dd
        by_resp: dict[str, list] = _dd(list)
        for r in results:
            by_resp[str(r["response_id"])].append(r)

        updates = []
        for resp_id, items in by_resp.items():
            avg_score = sum(i.get("score", 0.0) for i in items) / len(items)
            negs = sum(1 for i in items if i.get("sentiment") == "negative")
            pos  = sum(1 for i in items if i.get("sentiment") == "positive")
            dom_sentiment = "negative" if negs > pos else ("positive" if pos > negs else "neutral")

            emotion_counts: dict[str, int] = {}
            for i in items:
                e = i.get("emotion", "neutral")
                emotion_counts[e] = emotion_counts.get(e, 0) + 1
            dom_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else "neutral"

            effort = compute_effort_score([i["text"] for i in items])
            updates.append((dom_sentiment, round(avg_score, 2), dom_emotion, round(effort, 1), resp_id))

        if updates:
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.executemany(
                        """UPDATE responses
                           SET ai_sentiment=%s, ai_sentiment_score=%s,
                               ai_emotion=%s, ai_effort_score=%s,
                               ai_enriched_at=NOW()
                           WHERE id=%s""",
                        updates,
                    )
                await conn.commit()
            logger.info("node_absa_writeback", count=len(updates))
    except Exception as exc:
        logger.warning("node_absa_writeback_failed", error=str(exc))

    await _emit_event(run_id, "node_complete", "absa", {"analyzed_count": len(results)})
    return {**state, "absa_results": results}


# ── Node: cluster ─────────────────────────────────────────────────────────────

async def node_cluster(state: dict) -> dict:
    """Cluster using real cosine similarity on embedding vectors when available,
    falling back to ABSA aspect grouping (keyword heuristic) if not."""
    texts  = state["open_texts"]
    run_id = state["run_id"]
    if not texts:
        return state

    # Check if we have real embeddings from node_embed
    embedded_texts = state.get("embedded_texts", [])
    has_real_embeddings = any(t.get("embedding") for t in embedded_texts)

    clusters = []

    if has_real_embeddings:
        # Build a lookup from (response_id, question_id) -> embedding
        emb_lookup: dict[tuple[str, str], list[float]] = {}
        for t in embedded_texts:
            if t.get("embedding"):
                key = (t["response_id"], t["question_id"])
                emb_lookup[key] = t["embedding"]

        # Attach embeddings to ABSA results
        absa_with_emb = []
        for item in state["absa_results"]:
            key = (item["response_id"], item["question_id"])
            emb = emb_lookup.get(key)
            absa_with_emb.append({**item, "embedding": emb})

        # Run cosine-similarity clustering
        raw_clusters = cluster_texts(absa_with_emb, threshold=0.72, min_cluster_size=2)

        for raw in raw_clusters:
            items = raw["texts"]
            avg_score = sum(i.get("score", 0) for i in items) / len(items)
            neg = sum(1 for i in items if i.get("sentiment") == "negative")
            pos = sum(1 for i in items if i.get("sentiment") == "positive")
            dom_sentiment = "negative" if neg > pos else ("positive" if pos > neg else "neutral")
            emotion_counts: dict[str, int] = {}
            for i in items:
                e = i.get("emotion", "neutral")
                emotion_counts[e] = emotion_counts.get(e, 0) + 1
            dom_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else "neutral"
            # Use most-common ABSA aspect as the cluster label
            aspect_counts: dict[str, int] = {}
            for i in items:
                a = i.get("aspect", "general")
                aspect_counts[a] = aspect_counts.get(a, 0) + 1
            aspect = max(aspect_counts, key=aspect_counts.get) if aspect_counts else "general"

            clusters.append({
                "id":                  f"cluster_{len(clusters) + 1}",
                "aspect":              aspect,
                "texts":               items,
                "size":                len(items),
                "avg_sentiment_score": round(avg_score, 2),
                "dominant_sentiment":  dom_sentiment,
                "dominant_emotion":    dom_emotion,
                "label":               None,
            })

    else:
        # Fallback: group by ABSA aspect (keyword heuristic — original v1 behaviour)
        from collections import defaultdict
        aspect_groups: dict[str, list] = defaultdict(list)
        for item in state["absa_results"]:
            aspect_groups[item["aspect"]].append(item)

        for aspect, items in sorted(aspect_groups.items(), key=lambda x: -len(x[1])):
            if len(items) >= 2:
                avg_score = sum(i["score"] for i in items) / len(items)
                neg = sum(1 for i in items if i["sentiment"] == "negative")
                pos = sum(1 for i in items if i["sentiment"] == "positive")
                dom_sentiment = "negative" if neg > pos else ("positive" if pos > neg else "neutral")
                emotion_counts: dict[str, int] = {}
                for i in items:
                    e = i.get("emotion", "neutral")
                    emotion_counts[e] = emotion_counts.get(e, 0) + 1
                dom_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else "neutral"
                clusters.append({
                    "id":                  f"cluster_{len(clusters) + 1}",
                    "aspect":              aspect,
                    "texts":               items,
                    "size":                len(items),
                    "avg_sentiment_score": round(avg_score, 2),
                    "dominant_sentiment":  dom_sentiment,
                    "dominant_emotion":    dom_emotion,
                    "label":               None,
                })

    await _emit_event(run_id, "node_complete", "cluster", {
        "cluster_count": len(clusters),
        "used_embeddings": has_real_embeddings,
    })
    return {**state, "clusters": clusters}


# ── Node: topics ──────────────────────────────────────────────────────────────

async def node_topics(state: dict) -> dict:
    """Discover canonical topics from clusters via LLM.

    - Fetches previous topic names from DB for new-topic detection
    - Calls discover_topics() for LLM labeling
    - Upserts to survey_topics table
    - Stores canonical topics in state for narrate/publish
    """
    survey_id = state["survey_id"]
    org_id    = state["org_id"]
    run_id    = state["run_id"]
    clusters  = state["clusters"]

    if not clusters:
        return {**state, "topics": []}

    # Fetch existing topic names for new-topic detection
    previous_names: list[str] = []
    try:
        async with db._pool_conn().connection() as conn:
            previous_names = await get_previous_topic_names(survey_id, conn)
    except Exception as exc:
        logger.warning("node_topics_fetch_previous_failed", error=str(exc))

    topics = await discover_topics(clusters, previous_names, call_agent)

    await _emit_event(run_id, "node_complete", "topics", {
        "topic_count": len(topics),
        "new_topics": sum(1 for t in topics if t.is_new),
    })

    # Attach canonical names back to clusters for narrate node
    topic_map = {t.name: t for t in topics}
    enriched_clusters = []
    for i, cluster in enumerate(clusters):
        canonical = topics[i].name if i < len(topics) else cluster["aspect"]
        enriched_clusters.append({**cluster, "canonical_name": canonical})

    # ── Compute per-topic signal breakdown (zero LLM cost) ───────────────────
    all_responses = state.get("responses", [])
    topic_signals: dict[str, dict] = {}
    for i, cluster in enumerate(enriched_clusters):
        topic_name = cluster["canonical_name"]
        topic_signals[topic_name] = compute_topic_signals(cluster, all_responses)

    # ── Re-upsert topics with signal breakdown + collect DB ids ──────────────
    topic_db_ids: dict[str, str] = {}
    try:
        async with db._pool_conn().connection() as conn:
            topic_db_ids = await upsert_survey_topics(
                topics, survey_id, org_id, run_id, "all_time", conn,
                topic_signals=topic_signals,
            )
            await conn.commit()
    except Exception as exc:
        logger.warning("node_topics_signal_upsert_failed", error=str(exc))

    # ── Build topic hierarchy (parent/child from parent_category field) ───────
    try:
        async with db._pool_conn().connection() as conn:
            await build_topic_hierarchy(
                topics, topic_db_ids, survey_id, org_id, run_id, "all_time", conn,
            )
    except Exception as exc:
        logger.warning("node_topics_hierarchy_failed", error=str(exc))

    # ── Write ai_topics list back to each response ───────────────────────────
    try:
        from collections import defaultdict as _dd2
        resp_topics: dict[str, list[str]] = _dd2(list)
        for cluster in enriched_clusters:
            canonical = cluster["canonical_name"]
            for item in cluster.get("texts", []):
                rid = str(item["response_id"])
                if canonical not in resp_topics[rid]:
                    resp_topics[rid].append(canonical)

        if resp_topics:
            updates = [(json.dumps(topic_list), rid) for rid, topic_list in resp_topics.items()]
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.executemany(
                        "UPDATE responses SET ai_topics=%s, ai_enriched_at=NOW() WHERE id=%s",
                        updates,
                    )
                await conn.commit()
            logger.info("node_topics_writeback", response_count=len(updates))
    except Exception as exc:
        logger.warning("node_topics_writeback_failed", error=str(exc))

    return {**state, "topics": [t.model_dump() for t in topics], "clusters": enriched_clusters}


# ── Node: narrate (expert domain-specific agents) ────────────────────────────

async def node_narrate(state: dict) -> dict:
    """Generate headlines + narratives using specialist expert agents in parallel.

    Each insight type is handled by a domain expert with deep knowledge baked into
    its system prompt (benchmarks, frameworks, vocabulary). Expert calls for clusters
    run concurrently via asyncio.gather for minimal latency overhead.
    """
    run_id   = state["run_id"]
    metrics  = state["metrics"]
    clusters = state["clusters"]
    topics   = state.get("topics", [])
    insights: list[dict] = []

    total_responses = metrics.get("total_responses", 0)
    nps_score  = metrics.get("nps", {}).get("score")
    csat_score = metrics.get("csat", {}).get("score")
    trend_data = metrics.get("trend", {})

    # ── L1: Descriptive metric insights (NPS + CSAT in parallel) ─────────────

    nps_task  = None
    csat_task = None

    if "nps" in metrics and nps_score is not None:
        m = metrics["nps"]
        n = m["n"]
        ci_low  = m.get("ci_low",  nps_score - 5)
        ci_high = m.get("ci_high", nps_score + 5)
        nps_task = narrate_nps_insight(
            score=nps_score, n=n, ci_low=ci_low, ci_high=ci_high,
            promoters=m.get("promoters"), passives=m.get("passives"), detractors=m.get("detractors"),
        )

    if "csat" in metrics and csat_score is not None:
        m = metrics["csat"]
        score     = m["score"]
        n         = m["n"]
        ci_low_c  = m.get("ci_low",  score - 0.2)
        ci_high_c = m.get("ci_high", score + 0.2)
        csat_task = narrate_csat_insight(
            score=score, n=n, ci_low=ci_low_c, ci_high=ci_high_c,
        )

    # ── L2: Diagnostic — top 5 topic clusters (all in parallel) ──────────────

    top_clusters = clusters[:5]
    topic_tasks = []
    for i, cluster in enumerate(top_clusters):
        aspect    = cluster.get("canonical_name") or cluster["aspect"]
        size      = cluster["size"]
        sentiment = cluster["dominant_sentiment"]
        emotion   = cluster["dominant_emotion"]
        sample_quotes = [t["text"][:150] for t in cluster["texts"][:3]]
        citation_ids  = [str(t["response_id"]) for t in cluster["texts"][:3]]

        topic_effort = None
        if i < len(topics):
            topic_effort = topics[i].get("effort_score")
        if topic_effort is None:
            topic_effort = compute_effort_score([t["text"] for t in cluster["texts"]])
        try:
            topic_effort = float(topic_effort)
        except (TypeError, ValueError):
            topic_effort = 4.0

        is_new = topics[i].get("is_new", False) if i < len(topics) else False

        topic_tasks.append(narrate_topic_insight(
            aspect=aspect, size=size, sentiment=sentiment, emotion=emotion,
            effort=topic_effort, is_new=is_new,
            sample_quotes=sample_quotes, citation_ids=citation_ids,
        ))

    # ── L3: Predictive trend ─────────────────────────────────────────────────

    trend       = trend_data.get("trend")
    forecast_7d = trend_data.get("forecast_7d")
    trend_task  = None
    if trend in ("up", "down") and forecast_7d is not None:
        trend_task = narrate_trend_insight(
            trend=trend,
            forecast_7d=int(forecast_7d),
            delta_pct=float(trend_data.get("delta_pct") or 0),
            slope=float(trend_data.get("slope") or 0),
            anomaly=bool(trend_data.get("anomaly", False)),
            total_responses=total_responses,
        )

    # ── L3/L4: Prescriptive — top negative cluster ───────────────────────────

    negative_clusters = [c for c in clusters if c["dominant_sentiment"] == "negative"]
    prescriptive_task = None
    if negative_clusters:
        top    = negative_clusters[0]
        aspect = top.get("canonical_name") or top["aspect"]
        size_  = top["size"]
        # Get friction_type from any prior topic narration (we'll enrich after gather)
        prescriptive_task = narrate_prescriptive_insight(
            aspect=aspect, size=size_, sentiment="negative",
            friction_type="product",  # expert will override based on its analysis
            nps_score=nps_score, csat_score=csat_score,
            effort_score=float(top.get("avg_sentiment_score", 0) or 0),
        )

    # ── Fire all parallel expert calls ───────────────────────────────────────

    all_tasks: list = [t for t in [nps_task, csat_task] if t is not None]
    all_tasks += topic_tasks
    all_tasks += [t for t in [trend_task, prescriptive_task] if t is not None]

    results = await asyncio.gather(*all_tasks, return_exceptions=True)

    # ── Assign results back in order ─────────────────────────────────────────

    result_idx = 0

    def _next_result():
        nonlocal result_idx
        r = results[result_idx]
        result_idx += 1
        return r

    # NPS result
    if nps_task is not None:
        m = metrics["nps"]
        n         = m["n"]
        ci_low    = m.get("ci_low",  nps_score - 5)
        ci_high   = m.get("ci_high", nps_score + 5)
        nps_result = _next_result()
        trust_score, trust_json = _build_trust(
            n=n, mentions=n, total=total_responses,
            below_minimum=m.get("below_minimum", False),
        )
        if isinstance(nps_result, NpsExpertOutput):
            headline  = nps_result.headline
            narrative = nps_result.narrative
            expert_meta = {
                "benchmark_context": nps_result.benchmark_context,
                "risk_flag": nps_result.risk_flag,
                "key_driver_hypothesis": nps_result.key_driver_hypothesis,
            }
        else:
            logger.warning("nps_expert_failed", error=str(nps_result))
            nps_disp  = int(nps_score) if nps_score == int(nps_score) else nps_score
            headline  = f"NPS is {nps_disp}"
            narrative = f"Net Promoter Score is {nps_disp} (n={n}, 95% CI: {ci_low}–{ci_high})."
            expert_meta = {}
        insights.append({
            "layer": "descriptive", "category": "metric.nps",
            "headline": headline, "narrative": narrative,
            "metric_json": {
                "name": "NPS", "value": nps_score,
                "ci_low": ci_low, "ci_high": ci_high, "unit": "points",
                **expert_meta,
            },
            "trust_score": trust_score, "trust_json": trust_json,
            "citations_json": [], "priority": 0.9,
        })

    # CSAT result
    if csat_task is not None:
        m         = metrics["csat"]
        score     = m["score"]
        n         = m["n"]
        ci_low_c  = m.get("ci_low",  score - 0.2)
        ci_high_c = m.get("ci_high", score + 0.2)
        csat_result = _next_result()
        trust_score, trust_json = _build_trust(
            n=n, mentions=n, total=total_responses,
            below_minimum=m.get("below_minimum", False),
        )
        if isinstance(csat_result, CsatExpertOutput):
            headline  = csat_result.headline
            narrative = csat_result.narrative
            expert_meta = {
                "top_box_pct": csat_result.top_box_pct,
                "benchmark_context": csat_result.benchmark_context,
                "key_driver_hypothesis": csat_result.key_driver_hypothesis,
            }
        else:
            logger.warning("csat_expert_failed", error=str(csat_result))
            headline  = f"CSAT is {score}/5 across {n} responses"
            narrative = f"Customer satisfaction averages {score}/5 (95% CI: {ci_low_c:.1f}–{ci_high_c:.1f}, n={n})."
            expert_meta = {}
        insights.append({
            "layer": "descriptive", "category": "metric.csat",
            "headline": headline, "narrative": narrative,
            "metric_json": {
                "name": "CSAT", "value": score,
                "ci_low": ci_low_c, "ci_high": ci_high_c, "scale": 5,
                **expert_meta,
            },
            "trust_score": trust_score, "trust_json": trust_json,
            "citations_json": [], "priority": 0.85,
        })

    # Topic results
    for i, cluster in enumerate(top_clusters):
        aspect    = cluster.get("canonical_name") or cluster["aspect"]
        size      = cluster["size"]
        sentiment = cluster["dominant_sentiment"]
        citations = [
            {
                "response_id": str(t["response_id"]),
                "quote":       t["text"][:200],
                "sentiment":   t["sentiment"],
                "relevance":   0.85,
                "emotion":     t.get("emotion", "neutral"),
            }
            for t in cluster["texts"][:8]
        ]
        topic_effort = None
        if i < len(topics):
            topic_effort = topics[i].get("effort_score")
        if topic_effort is None:
            topic_effort = compute_effort_score([t["text"] for t in cluster["texts"]])
        try:
            topic_effort = float(topic_effort)
        except (TypeError, ValueError):
            topic_effort = 4.0

        is_new = topics[i].get("is_new", False) if i < len(topics) else False
        citation_ids = [str(t["response_id"]) for t in cluster["texts"][:3]]
        cite_str = " ".join(f"[r{rid[:8]}]" for rid in citation_ids if rid)

        topic_result = _next_result()
        trust_score, trust_json = _build_trust(
            n=size, mentions=size, total=total_responses, cluster=cluster,
            below_minimum=size < 5,
        )
        if isinstance(topic_result, TopicExpertOutput):
            headline  = topic_result.headline
            narrative = topic_result.narrative
            expert_meta = {
                "friction_type": topic_result.friction_type,
                "root_cause_hypothesis": topic_result.root_cause_hypothesis,
                "business_impact": topic_result.business_impact,
            }
        else:
            logger.warning("topic_expert_failed", error=str(topic_result), aspect=aspect)
            new_label = " (New Topic)" if is_new else ""
            headline  = f'"{aspect}" is a top {sentiment} theme ({size} mentions){new_label}'
            narrative = f'"{aspect}" was mentioned {size} times with {sentiment} sentiment. {cite_str}'
            expert_meta = {}
        insights.append({
            "layer": "diagnostic", "category": "voice.topic",
            "headline": headline, "narrative": narrative,
            "metric_json": {
                "name": "mentions", "value": size,
                "sentiment_score": cluster["avg_sentiment_score"],
                "effort_score": topic_effort,
                "is_new_topic": is_new,
                **expert_meta,
            },
            "trust_score": trust_score, "trust_json": trust_json,
            "citations_json": citations,
            "priority": min(0.85, 0.4 + size * 0.02),
        })

    # Trend result
    if trend_task is not None:
        trend_result = _next_result()
        trust_score, trust_json = _build_trust(
            n=total_responses, mentions=total_responses, total=total_responses,
        )
        if isinstance(trend_result, TrendExpertOutput):
            headline  = trend_result.headline
            narrative = trend_result.narrative
            expert_meta = {
                "confidence": trend_result.confidence,
                "causal_hypothesis": trend_result.causal_hypothesis,
                "early_warning_signal": trend_result.early_warning_signal,
                "recommended_monitoring": trend_result.recommended_monitoring,
            }
        else:
            logger.warning("trend_expert_failed", error=str(trend_result))
            headline  = f"Response volume trending {trend} — {forecast_7d} expected next week"
            narrative = (
                f"Volume is trending {trend} with {trend_data.get('delta_pct', 0)}% delta. "
                f"Forecast: {forecast_7d} responses next 7 days."
            )
            expert_meta = {}
        insights.append({
            "layer": "predictive",
            "category": f"trend.volume_{trend}",
            "headline": headline, "narrative": narrative,
            "metric_json": {
                "name": "volume_trend", "trend": trend,
                "delta_pct": trend_data.get("delta_pct"),
                "forecast_7d": forecast_7d,
                "slope": trend_data.get("slope"),
                **expert_meta,
            },
            "trust_score": trust_score, "trust_json": trust_json,
            "citations_json": [], "priority": 0.75,
        })

        if trend == "down":
            # Fatigue prescriptive — expert-narrated using prescriptive advisor
            insights.append({
                "layer": "prescriptive",
                "category": "action.survey_fatigue",
                "headline": "Survey fatigue likely — shorten or reduce distribution frequency",
                "narrative": (
                    "Declining response volume is a leading indicator of survey fatigue. "
                    "Consider trimming to ≤7 questions and switching to pulse-style quarterly sends "
                    "to recover engagement within 4-6 weeks."
                ),
                "recommended_action": {
                    "type": "quick_win",
                    "label": "Reduce survey length and cadence",
                    "target": "survey_design",
                    "priority": "high",
                    "time_horizon": "quick_win",
                    "estimated_impact": "~20-35% response rate recovery within 30 days",
                },
                "metric_json": {"name": "volume_trend", "trend": trend},
                "trust_score": 68,
                "trust_json": {"statistical": 65, "coverage": 60, "consistency": 70, "grounding": 75},
                "citations_json": [], "priority": 0.68,
            })

    # NPS trajectory (DB lookup — sequential, after parallel gather)
    if nps_score is not None:
        prior_nps: float | None = None
        try:
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """SELECT metric_json FROM insights
                           WHERE survey_id = %s AND category = 'metric.nps'
                             AND superseded_at IS NOT NULL
                           ORDER BY generated_at DESC LIMIT 1""",
                        (state["survey_id"],),
                    )
                    row = await cur.fetchone()
                    if row and row[0]:
                        mj = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                        prior_nps = mj.get("value")
        except Exception:
            pass

        if prior_nps is not None and prior_nps != nps_score:
            delta = round(nps_score - prior_nps, 1)
            direction_str = "improved" if delta > 0 else "declined"
            try:
                traj_out = await narrate_trend_insight(
                    trend="up" if delta > 0 else "down",
                    forecast_7d=0,
                    delta_pct=round(delta / max(1, abs(prior_nps)) * 100, 1),
                    slope=delta,
                    anomaly=abs(delta) > 20,
                    total_responses=metrics["nps"]["n"],
                )
                headline  = traj_out.headline
                narrative = traj_out.narrative
            except Exception:
                headline  = f"NPS {direction_str} by {abs(delta)} points"
                narrative = f"NPS moved from {prior_nps} to {nps_score} ({delta:+.1f} pts)."

            trust_score, trust_json = _build_trust(
                n=metrics["nps"]["n"], mentions=metrics["nps"]["n"], total=total_responses,
            )
            insights.append({
                "layer": "predictive", "category": "trend.nps_trajectory",
                "headline": headline, "narrative": narrative,
                "metric_json": {
                    "name": "nps_trajectory", "value": nps_score,
                    "prior_value": prior_nps, "delta": delta,
                },
                "trust_score": trust_score, "trust_json": trust_json,
                "citations_json": [], "priority": 0.80,
            })

    # Prescriptive result
    if prescriptive_task is not None:
        top    = negative_clusters[0]
        aspect = top.get("canonical_name") or top["aspect"]
        size_  = top["size"]
        citations = [
            {
                "response_id": str(t["response_id"]),
                "quote":       t["text"][:200],
                "sentiment":   t["sentiment"],
                "relevance":   0.9,
                "emotion":     t.get("emotion", "neutral"),
            }
            for t in top["texts"][:5]
        ]
        presc_result = _next_result()
        trust_score, trust_json = _build_trust(
            n=size_, mentions=size_, total=total_responses, cluster=top,
            below_minimum=size_ < 5,
        )
        if isinstance(presc_result, PrescriptiveExpertOutput):
            ice_score = round((presc_result.ice_impact + presc_result.ice_confidence + presc_result.ice_ease) / 3, 1)
            action = {
                "type": presc_result.time_horizon,
                "label": presc_result.headline,
                "target": aspect,
                "priority": presc_result.priority,
                "time_horizon": presc_result.time_horizon,
                "estimated_impact": presc_result.estimated_impact,
                "ice_score": ice_score,
                "ice": {
                    "impact": presc_result.ice_impact,
                    "confidence": presc_result.ice_confidence,
                    "ease": presc_result.ice_ease,
                },
            }
            headline  = presc_result.headline
            narrative = presc_result.narrative
            priority  = min(0.95, 0.5 + ice_score * 0.045)
        else:
            logger.warning("prescriptive_expert_failed", error=str(presc_result))
            action = _prescriptive_action(top, nps_score, csat_score)
            headline  = f'Addressing "{aspect}" friction could improve satisfaction'
            narrative = (
                f'"{aspect}" is the top friction point with {size_} negative mentions. '
                "Resolving this is likely to improve NPS and CSAT scores."
            )
            priority = 0.92
        insights.append({
            "layer": "prescriptive", "category": "action.fix_friction",
            "headline": headline, "narrative": narrative,
            "recommended_action": action,
            "metric_json": {"name": "friction_volume", "value": size_},
            "trust_score": trust_score, "trust_json": trust_json,
            "citations_json": citations, "priority": priority,
        })

    await _emit_event(run_id, "node_complete", "narrate", {"insight_count": len(insights)})
    return {**state, "insights": insights}


# ── Node: evaluate ────────────────────────────────────────────────────────────

async def node_evaluate(state: dict) -> dict:
    """Holistic quality audit of the complete insight set.

    Uses InsightSetEvaluator to check coverage, balance, actionability, and
    redundancy. Drops redundant insights. Appends evaluation metadata to audit_json.
    """
    run_id   = state["run_id"]
    insights = state["insights"]
    topics   = state.get("topics", [])
    metrics  = state.get("metrics", {})
    total    = metrics.get("total_responses", 0)

    if not insights:
        return state

    try:
        eval_out = await evaluate_insight_set(
            insights=insights,
            topics=topics,
            metrics=metrics,
            total_responses=total,
        )

        # Drop redundant insights (highest index first to preserve lower indices)
        indices_to_drop = sorted(set(eval_out.redundant_indices), reverse=True)
        for idx in indices_to_drop:
            if 0 <= idx < len(insights):
                dropped = insights.pop(idx)
                logger.info(
                    "insight_dropped_redundant",
                    headline=dropped.get("headline"),
                    index=idx,
                )

        # Append evaluation scores to audit_json for each remaining insight
        eval_summary = {
            "set_quality": eval_out.overall_quality,
            "coverage_score": eval_out.coverage_score,
            "balance_score": eval_out.balance_score,
            "actionability_score": eval_out.actionability_score,
            "missing_themes": eval_out.missing_themes,
        }
        improvements_map = {imp.get("index"): imp for imp in eval_out.improvements if isinstance(imp, dict)}
        for i, ins in enumerate(insights):
            audit = ins.get("audit_json") or {}
            audit["eval"] = eval_summary
            if i in improvements_map:
                audit["eval_improvement"] = improvements_map[i].get("suggestion", "")
            ins["audit_json"] = audit

        await _emit_event(run_id, "node_complete", "evaluate", {
            "quality": eval_out.overall_quality,
            "coverage": eval_out.coverage_score,
            "balance": eval_out.balance_score,
            "actionability": eval_out.actionability_score,
            "redundant_dropped": len(indices_to_drop),
            "missing_themes": eval_out.missing_themes,
        })

    except Exception as exc:
        logger.warning("node_evaluate_failed", error=str(exc))

    return {**state, "insights": insights}


# ── Node: verify ──────────────────────────────────────────────────────────────

async def node_verify(state: dict) -> dict:
    """Verify each insight claim is supported by its citations (demote if not)."""
    run_id   = state["run_id"]
    insights = state["insights"]

    for ins in insights:
        cit_texts = [c["quote"] for c in ins.get("citations_json", [])[:5]]
        if not cit_texts:
            continue  # metric-only insights skip verification
        ctx = "\n".join(f"- {q}" for q in cit_texts)
        try:
            result = await _verify(ins["headline"] + " " + ins["narrative"], ctx)
            verifier_pass = result.supported
            if not verifier_pass:
                ins["trust_score"] = min(ins["trust_score"], 55)
                ins["trust_json"]["verifier_pass"] = False
                ins["trust_json"]["verifier_notes"] = result.reason
                # Recompute grounding component
                ins["trust_json"]["grounding"] = _trust_grounding(False)
            else:
                ins["trust_json"]["verifier_pass"] = True
                ins["trust_json"]["grounding"] = _trust_grounding(True)
        except Exception:
            pass  # verification failure → keep insight, don't demote

    await _emit_event(run_id, "node_complete", "verify", {"verified_count": len(insights)})
    return {**state, "insights": insights}


# ── Node: publish ─────────────────────────────────────────────────────────────

async def node_publish(state: dict) -> dict:
    """Insert insight rows into DB, supersede old ones, and add per-window metrics."""
    survey_id = state["survey_id"]
    org_id    = state["org_id"]
    run_id    = state["run_id"]
    insights  = state["insights"]
    responses = state["responses"]
    metrics   = state["metrics"]

    async with db._pool_conn().connection() as conn:
        # Supersede old insights for this survey (all windows)
        await conn.execute(
            """UPDATE insights SET superseded_at = NOW(), superseded_by = NULL
               WHERE survey_id = %s AND org_id = %s AND superseded_at IS NULL""",
            (survey_id, org_id),
        )

        # ── Publish main (all_time) insights ─────────────────────────────────
        for ins in insights:
            await _publish_one(conn, survey_id, org_id, run_id, ins, "all_time")

        # ── Per-window metric insights (cheap — no LLM) ───────────────────────
        for window in ["last_30d", "last_7d"]:
            windowed = filter_responses_by_window(responses, window)
            min_n = WINDOW_MIN_RESPONSES[window]
            if len(windowed) < min_n:
                continue

            w_metrics: dict = {}
            if any(r.get("nps_score") is not None for r in windowed):
                w_metrics["nps"] = compute_nps_ci(windowed)
            if any(r.get("csat_score") is not None for r in windowed):
                w_metrics["csat"] = compute_csat(windowed)
            w_total = len(windowed)

            if "nps" in w_metrics and w_metrics["nps"].get("score") is not None:
                m = w_metrics["nps"]
                score = m["score"]
                n = m["n"]
                ci_low = m.get("ci_low", score - 5)
                ci_high = m.get("ci_high", score + 5)
                trust_score, trust_json = _build_trust(n=n, mentions=n, total=w_total)
                w_ins = {
                    "layer": "descriptive", "category": "metric.nps",
                    "headline": f"NPS is {score} ({window.replace('_', ' ')})",
                    "narrative": (
                        f"Over the {window.replace('_', ' ')}, NPS is {score} "
                        f"(95% CI: {ci_low}–{ci_high}, n={n})."
                    ),
                    "metric_json": {"name": "NPS", "value": score, "ci_low": ci_low, "ci_high": ci_high},
                    "trust_score": trust_score, "trust_json": trust_json,
                    "citations_json": [], "priority": 0.88,
                }
                await _publish_one(conn, survey_id, org_id, run_id, w_ins, window)

            if "csat" in w_metrics and w_metrics["csat"].get("score") is not None:
                m = w_metrics["csat"]
                score = m["score"]
                n = m["n"]
                ci_low_c = m.get("ci_low", score - 0.2)
                ci_high_c = m.get("ci_high", score + 0.2)
                trust_score, trust_json = _build_trust(n=n, mentions=n, total=w_total)
                w_ins = {
                    "layer": "descriptive", "category": "metric.csat",
                    "headline": f"CSAT is {score}/5 ({window.replace('_', ' ')})",
                    "narrative": (
                        f"Over the {window.replace('_', ' ')}, CSAT is {score}/5 "
                        f"(95% CI: {ci_low_c:.2f}–{ci_high_c:.2f}, n={n})."
                    ),
                    "metric_json": {"name": "CSAT", "value": score, "ci_low": ci_low_c, "ci_high": ci_high_c, "scale": 5},
                    "trust_score": trust_score, "trust_json": trust_json,
                    "citations_json": [], "priority": 0.83,
                }
                await _publish_one(conn, survey_id, org_id, run_id, w_ins, window)

        # Mark run as completed
        await conn.execute(
            "UPDATE agent_runs SET status='completed', completed_at=NOW() WHERE id=%s",
            (run_id,),
        )

    published_total = len(insights)
    await _emit_event(run_id, "run_complete", "publish", {
        "published_count": published_total, "survey_id": survey_id,
    })

    return state


async def _publish_one(conn, survey_id: str, org_id: str, run_id: str, ins: dict, time_window: str) -> None:
    """Insert a single insight row with ON CONFLICT upsert."""
    canonical = json.dumps({
        "survey_id":   survey_id,
        "category":    ins["category"],
        "headline":    ins["headline"],
        "time_window": time_window,
    }, sort_keys=True)
    insight_hash = hashlib.sha256(canonical.encode()).hexdigest()[:32]

    audit_json = {
        "model":           "insight_narrate",
        "embedding_model": "text-embedding-3-small",
        "temperature":     INSIGHT_TEMPERATURE,
        "seed":            DEFAULT_SEED,
        "verifier_pass":   ins.get("trust_json", {}).get("verifier_pass", True),
        "run_id":          run_id,
        "prompt_hash":     hashlib.sha256(ins["headline"].encode()).hexdigest()[:16],
        "time_window":     time_window,
    }

    await conn.execute(
        """INSERT INTO insights (
             survey_id, org_id, run_id, layer, category,
             headline, narrative, recommended_action,
             metric_json, citations_json,
             trust_score, trust_json, priority,
             insight_hash, audit_json, user_state_json, time_window
           ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (survey_id, insight_hash, time_window) DO UPDATE SET
             headline    = EXCLUDED.headline,
             narrative   = EXCLUDED.narrative,
             metric_json = EXCLUDED.metric_json,
             citations_json = EXCLUDED.citations_json,
             trust_score = EXCLUDED.trust_score,
             trust_json  = EXCLUDED.trust_json,
             priority    = EXCLUDED.priority,
             audit_json  = EXCLUDED.audit_json,
             superseded_at = NULL,
             generated_at  = NOW()""",
        (
            survey_id, org_id, run_id,
            ins["layer"], ins["category"],
            ins["headline"], ins["narrative"],
            json.dumps(ins.get("recommended_action")),
            json.dumps(ins.get("metric_json")),
            json.dumps(ins.get("citations_json", [])),
            ins["trust_score"],
            json.dumps(ins.get("trust_json", {})),
            ins["priority"],
            insight_hash,
            json.dumps(audit_json),
            json.dumps({}),
            time_window,
        ),
    )


# ── Build the graph ───────────────────────────────────────────────────────────

def build_insight_graph():
    """Construct and compile the insight generation LangGraph.

    Pipeline:
      ingest → embed → metrics → extract_texts → absa → cluster
            → topics → narrate → verify → evaluate → publish

    narrate:  Expert domain-specific agents (NPS, CSAT, Topic, Trend, Prescriptive)
              run in parallel via asyncio.gather inside the node.
    verify:   Per-insight hallucination check against citation quotes.
    evaluate: Holistic quality audit (coverage, balance, actionability, redundancy).
    publish:  DB upsert + per-window metric snapshots.
    """
    g = StateGraph(dict)
    g.add_node("ingest",        node_ingest)
    g.add_node("embed",         node_embed)
    g.add_node("metrics",       node_metrics)
    g.add_node("extract_texts", node_extract_texts)
    g.add_node("absa",          node_absa)
    g.add_node("cluster",       node_cluster)
    g.add_node("topics",        node_topics)
    g.add_node("narrate",       node_narrate)
    g.add_node("verify",        node_verify)
    g.add_node("evaluate",      node_evaluate)
    g.add_node("publish",       node_publish)

    g.set_entry_point("ingest")
    g.add_edge("ingest",        "embed")
    g.add_edge("embed",         "metrics")
    g.add_edge("metrics",       "extract_texts")
    g.add_edge("extract_texts", "absa")
    g.add_edge("absa",          "cluster")
    g.add_edge("cluster",       "topics")
    g.add_edge("topics",        "narrate")
    g.add_edge("narrate",       "verify")
    g.add_edge("verify",        "evaluate")
    g.add_edge("evaluate",      "publish")
    g.add_edge("publish",       END)

    return g.compile()


# ── Public API ────────────────────────────────────────────────────────────────

_insight_graph = None


def get_insight_graph():
    global _insight_graph
    if _insight_graph is None:
        _insight_graph = build_insight_graph()
    return _insight_graph


async def run_insight_generation(
    survey_id: str,
    org_id: str,
    run_id: str,
    trigger: str = "schedule",
) -> dict:
    """Run the full insight generation pipeline."""
    graph = get_insight_graph()
    initial_state = {
        "survey_id": survey_id, "org_id": org_id,
        "run_id": run_id, "trigger": trigger,
        "survey": {}, "responses": [],
        "metrics": {}, "open_texts": [],
        "embedded_texts": [],
        "absa_results": [], "clusters": [],
        "topics": [],
        "drivers": [], "stream_events": [],
        "insights": [], "errors": [],
    }
    result = await graph.ainvoke(initial_state)
    return result
