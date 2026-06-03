"""LLM-based topic discovery and canonical topic registry management.

Takes raw ABSA clusters and produces canonical topic names, detects new topics
vs existing ones (fuzzy match without external libs), computes effort scores,
and upserts into survey_topics table.
"""
from __future__ import annotations

import json
import traceback
from typing import Any

import structlog
from pydantic import BaseModel, Field, field_validator

from crystalos.tools.metrics import compute_effort_score

logger = structlog.get_logger()


# ── Schemas ──────────────────────────────────────────────────────────────────

class TopicItem(BaseModel):
    name: str = Field(description="Canonical topic name, 1-4 words, title case")
    parent_category: str | None = Field(default=None, description="Broader theme grouping this topic, e.g. 'Onboarding', 'Support'. Null for standalone topics.")
    aliases: list[str] = Field(default_factory=list, description="Other names for this topic found in the data")
    is_new: bool = Field(default=False)
    summary: str = Field(description="1-sentence summary of this topic")
    volume: int
    sentiment_score: float = Field(ge=-1.0, le=1.0, description="Average sentiment -1 to 1")
    dominant_emotion: str
    effort_score: float = Field(default=4.0, ge=1.0, le=7.0, description="1-7, higher = more customer effort/frustration; overridden by compute_effort_score after LLM response")

    @field_validator("effort_score", mode="before")
    @classmethod
    def clamp_effort_score(cls, v) -> float:
        return max(1.0, min(7.0, float(v or 4.0)))


class TopicDiscoveryOutput(BaseModel):
    topics: list[TopicItem]


# ── Levenshtein distance (no external lib) ───────────────────────────────────

def _levenshtein(a: str, b: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    a = a.lower()
    b = b.lower()
    if a == b:
        return 0
    if len(a) == 0:
        return len(b)
    if len(b) == 0:
        return len(a)
    # DP table
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            insert_cost = curr[j] + 1
            delete_cost = prev[j + 1] + 1
            replace_cost = prev[j] + (0 if ca == cb else 1)
            curr.append(min(insert_cost, delete_cost, replace_cost))
        prev = curr
    return prev[len(b)]


def _fuzzy_matches_any(name: str, previous_names: list[str], threshold: int = 3) -> bool:
    """Return True if `name` fuzzy-matches any name in `previous_names`.

    Match criteria (any of):
    - Levenshtein distance <= threshold
    - One is a substring of the other (after lowercasing)
    """
    name_lower = name.lower()
    for prev in previous_names:
        prev_lower = prev.lower()
        if name_lower in prev_lower or prev_lower in name_lower:
            return True
        if _levenshtein(name_lower, prev_lower) <= threshold:
            return True
    return False


# ── LLM-based topic discovery ────────────────────────────────────────────────

async def _discover_topics_chunk(
    chunk: list[dict],
    chunk_start_index: int,
    previous_topic_names: list[str],
    call_agent_func,
    survey_title: str = "",
    survey_intent: str = "",
) -> list[TopicItem]:
    """Call the LLM for a single chunk of clusters. Returns TopicItem list (not yet enriched).

    On LLM failure, falls back to heuristic labels — same behaviour as the original single-call path.
    chunk_start_index is the offset of this chunk within the full clusters list (used to align
    effort_score computation with the right cluster index in the outer loop).
    """
    # Build cluster summaries for the LLM
    cluster_summaries = []
    for i, c in enumerate(chunk):
        sample_texts = [t["text"][:150] for t in c.get("texts", [])[:5]]
        cluster_summaries.append({
            "cluster_index": chunk_start_index + i,
            "raw_aspect": c.get("aspect", "general"),
            "size": c.get("size", len(c.get("texts", []))),
            "dominant_sentiment": c.get("dominant_sentiment", "neutral"),
            "dominant_emotion": c.get("dominant_emotion", "neutral"),
            "avg_sentiment_score": c.get("avg_sentiment_score", 0.0),
            "sample_texts": sample_texts,
        })

    survey_ctx = ""
    if survey_title:
        survey_ctx = f'Survey: "{survey_title}"'
        if survey_intent:
            survey_ctx += f"\nGoal: {survey_intent}"
        survey_ctx += "\n\n"

    system = (
        f"{survey_ctx}"
        "You are an expert CX analyst. Given clusters of survey feedback, assign each cluster "
        "a precise canonical topic name that reflects what customers are ACTUALLY talking about. "
        "Names must be 1-4 words, title case (e.g. 'Response Time', 'Checkout Flow', 'Billing Clarity'). "
        "Use the survey context above to make names specific — avoid vague labels like 'General Feedback' or 'Other'. "
        "Return JSON matching the schema exactly."
    )
    user = (
        f"Clusters to label (JSON):\n{json.dumps(cluster_summaries, indent=2)}\n\n"
        f"Previous known topic names: {previous_topic_names}\n\n"
        "For each cluster return a TopicItem with: name (canonical, 1-4 words, title case), "
        "parent_category (broader theme that groups related topics, e.g. 'Onboarding' groups "
        "'Email Verification' and 'Password Reset'; use null for standalone topics with no clear parent), "
        "aliases (other ways this topic is mentioned), summary (1 sentence), "
        "volume (= cluster size), sentiment_score (-1.0 to 1.0), dominant_emotion, "
        "effort_score (1=effortless, 4=moderate, 7=extreme frustration/effort — how hard does "
        "this topic suggest the experience is for customers).\n"
        f"Return a TopicDiscoveryOutput JSON with a 'topics' list of {len(chunk)} items."
    )

    try:
        output, _ = await call_agent_func(
            agent_name="insight_topics",
            system=system,
            user=user,
            output_schema=TopicDiscoveryOutput,
        )
        return output.topics
    except Exception as exc:
        logger.error("discover_topics_chunk_llm_failed", error=str(exc), chunk_size=len(chunk), traceback=traceback.format_exc())
        # Fallback: use raw aspect labels as canonical names
        topics = []
        for c in chunk:
            aspect = c.get("aspect", "general")
            canonical = " ".join(word.capitalize() for word in aspect.replace("_", " ").split())
            size = c.get("size", len(c.get("texts", [])))
            all_texts = [t["text"] for t in c.get("texts", [])]
            topics.append(TopicItem(
                name=canonical,
                parent_category=None,
                aliases=[aspect] if aspect != canonical else [],
                summary=f"Customers mention '{canonical}' frequently with {c.get('dominant_sentiment', 'neutral')} sentiment.",
                volume=size,
                sentiment_score=float(v if (v := c.get("avg_sentiment_score")) is not None else 0.0),
                dominant_emotion=c.get("dominant_emotion", "neutral"),
                effort_score=compute_effort_score(all_texts),
            ))
        return topics


async def discover_topics(
    clusters: list[dict],
    previous_topic_names: list[str],
    call_agent_func,
    context_window: int = 64_000,
    survey_title: str = "",
    survey_intent: str = "",
) -> list[TopicItem]:
    """Discover canonical topics from ABSA clusters using LLM labeling.

    Args:
        clusters: From the cluster node — each has aspect, size, texts,
                  dominant_sentiment, dominant_emotion, avg_sentiment_score.
        previous_topic_names: Names of topics seen in prior runs (for new-topic detection).
        call_agent_func: The call_agent coroutine from openrouter.py.
        context_window: Token budget for the model (used to chunk large cluster lists).

    Returns:
        List of TopicItem with canonical names, is_new flags, effort scores, etc.
    """
    if not clusters:
        return []

    # ── Chunking logic: stay within both input and output budgets ─────────────
    # ~300 tokens per cluster summary in the prompt; use 45% of context for input.
    # ~150 tokens per TopicItem in the JSON output (name + summary + metadata).
    # Both limits are enforced so a large cluster list never truncates output.
    _TOKENS_PER_CLUSTER      = 300   # input estimate
    _TOKENS_PER_TOPIC_OUTPUT = 150   # output estimate per TopicItem

    input_budget = int(context_window * 0.45)
    max_clusters_by_input = max(5, input_budget // _TOKENS_PER_CLUSTER)

    # Fetch the output token budget from the model config to avoid truncation.
    try:
        from crystalos.lib.models import get_model as _get_model
        _topic_max_tokens = _get_model("insight_topics").max_tokens
    except Exception:
        _topic_max_tokens = 2000  # safe fallback
    max_clusters_by_output = max(5, _topic_max_tokens // _TOKENS_PER_TOPIC_OUTPUT)

    max_clusters_per_call = min(max_clusters_by_input, max_clusters_by_output)

    if len(clusters) <= max_clusters_per_call:
        # Single-call path — no chunking needed
        raw_topics = await _discover_topics_chunk(
            clusters, 0, previous_topic_names, call_agent_func,
            survey_title=survey_title, survey_intent=survey_intent,
        )
        # Enrich: is_new flag + effort_score from cluster texts
        enriched: list[TopicItem] = []
        for i, topic in enumerate(raw_topics):
            topic.is_new = not _fuzzy_matches_any(topic.name, previous_topic_names)
            if i < len(clusters):
                cluster_texts = [t["text"] for t in clusters[i].get("texts", [])]
                topic.effort_score = compute_effort_score(cluster_texts)
            enriched.append(topic)
        return enriched

    # ── Multi-chunk path ──────────────────────────────────────────────────────
    logger.info(
        "discover_topics_chunking",
        total_clusters=len(clusters),
        max_per_chunk=max_clusters_per_call,
        context_window=context_window,
    )

    all_topics: list[TopicItem] = []
    seen_names: list[str] = list(previous_topic_names)  # accumulate across chunks

    for chunk_start in range(0, len(clusters), max_clusters_per_call):
        chunk = clusters[chunk_start:chunk_start + max_clusters_per_call]
        chunk_topics = await _discover_topics_chunk(
            chunk, chunk_start, seen_names, call_agent_func,
            survey_title=survey_title, survey_intent=survey_intent,
        )

        # Enrich: is_new flag (against all known names so far) + effort_score
        for j, topic in enumerate(chunk_topics):
            topic.is_new = not _fuzzy_matches_any(topic.name, seen_names)
            cluster_idx = chunk_start + j
            if cluster_idx < len(clusters):
                cluster_texts = [t["text"] for t in clusters[cluster_idx].get("texts", [])]
                topic.effort_score = compute_effort_score(cluster_texts)

        # Deduplicate by name (keep first seen), then accumulate
        for topic in chunk_topics:
            if not any(t.name == topic.name for t in all_topics):
                all_topics.append(topic)
                seen_names.append(topic.name)

    return all_topics


# ── DB upsert ────────────────────────────────────────────────────────────────

def _compute_urgency(sentiment_score: float, volume: int, effort_score: float) -> float:
    """Bootstrap urgency estimate for the DB INSERT in upsert_survey_topics.

    This value is a lightweight placeholder computed before all topics are known.
    node_topics overwrites it with the normalized composite formula once the full
    topic set and total_responses are available (which requires all clusters).

    Formula: negativity × √volume × (effort/7), capped at 10.
    Uses negativity (not abs) — positive topics should never be flagged as urgent.
    Capped at 10 for consistency with the composite formula range [0, 10].
    """
    import math
    negativity    = max(0.0, -sentiment_score)
    effort_weight = max(0.0, effort_score) / 7.0
    raw = negativity * math.sqrt(max(0, volume)) * effort_weight
    return round(min(10.0, raw), 2)


async def upsert_survey_topics(
    topics: list[TopicItem],
    survey_id: str,
    org_id: str,
    run_id: str,
    time_window: str,
    conn,
    topic_signals: dict[str, dict] | None = None,
) -> dict[str, str]:
    """Upsert survey_topics rows via a single ON CONFLICT statement per topic.

    Deltas (trending, sentiment_momentum, volume_delta, chronic, streak) are
    computed entirely in SQL CASE WHEN so there are no separate SELECT round-trips
    and no race conditions when two scheduler ticks run concurrently.

    Requires a unique index on survey_topics(survey_id, name, time_window) — added
    by ensure_schema() in db.py.
    """
    if not topics:
        return {}

    topic_ids: dict[str, str] = {}
    signals = topic_signals or {}

    for topic in topics:
        sig = signals.get(topic.name, {})
        urgency = _compute_urgency(topic.sentiment_score, topic.volume, topic.effort_score)
        initial_streak = 1 if topic.sentiment_score < -0.2 else 0
        initial_trending = "new" if topic.is_new else "stable"

        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO survey_topics (
                           survey_id, org_id, run_id, time_window,
                           name, aliases, is_new, summary,
                           volume, sentiment_score, dominant_emotion,
                           effort_score, trending, sentiment_momentum,
                           urgency_score, volume_delta, volume_delta_pct,
                           chronic, negative_run_streak,
                           nps_avg, positive_pct, negative_pct, neutral_pct,
                           avg_response_len, emotion_distribution, sample_response_ids
                       ) VALUES (
                           %s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,
                           %s,%s,'stable',
                           %s,0,0.0,
                           false,%s,
                           %s,%s,%s,%s, %s,%s,%s
                       )
                       ON CONFLICT (survey_id, name, time_window) DO UPDATE SET
                           run_id             = EXCLUDED.run_id,
                           volume             = EXCLUDED.volume,
                           sentiment_score    = EXCLUDED.sentiment_score,
                           dominant_emotion   = EXCLUDED.dominant_emotion,
                           effort_score       = EXCLUDED.effort_score,
                           trending           = CASE
                               WHEN ABS(
                                   (EXCLUDED.volume - survey_topics.volume)::float
                                   / GREATEST(1, survey_topics.volume) * 100
                               ) < 10 THEN 'stable'
                               WHEN EXCLUDED.volume > survey_topics.volume THEN 'up'
                               ELSE 'down'
                           END,
                           sentiment_momentum = CASE
                               WHEN ABS(EXCLUDED.sentiment_score - survey_topics.sentiment_score) < 0.05
                               THEN 'stable'
                               WHEN EXCLUDED.sentiment_score > survey_topics.sentiment_score
                               THEN 'improving'
                               ELSE 'worsening'
                           END,
                           volume_delta       = EXCLUDED.volume - survey_topics.volume,
                           volume_delta_pct   = ROUND(
                               ((EXCLUDED.volume - survey_topics.volume)::float
                               / GREATEST(1, survey_topics.volume) * 100)::numeric, 1
                           ),
                           negative_run_streak = CASE
                               WHEN EXCLUDED.sentiment_score < -0.2
                               THEN survey_topics.negative_run_streak + 1
                               ELSE 0
                           END,
                           chronic            = CASE
                               WHEN EXCLUDED.sentiment_score < -0.2
                                    AND survey_topics.negative_run_streak >= 2
                               THEN true
                               ELSE false
                           END,
                           urgency_score      = EXCLUDED.urgency_score,
                           last_seen_at       = NOW(),
                           nps_avg            = EXCLUDED.nps_avg,
                           positive_pct       = EXCLUDED.positive_pct,
                           negative_pct       = EXCLUDED.negative_pct,
                           neutral_pct        = EXCLUDED.neutral_pct,
                           avg_response_len   = EXCLUDED.avg_response_len,
                           emotion_distribution = EXCLUDED.emotion_distribution,
                           sample_response_ids  = EXCLUDED.sample_response_ids,
                           summary            = COALESCE(EXCLUDED.summary, survey_topics.summary)
                       RETURNING id""",
                    (
                        survey_id, org_id, run_id, time_window,
                        topic.name, topic.aliases, topic.is_new, topic.summary or None,
                        topic.volume, topic.sentiment_score, topic.dominant_emotion,
                        topic.effort_score, initial_trending,
                        urgency, initial_streak,
                        sig.get("nps_avg"), sig.get("positive_pct"),
                        sig.get("negative_pct"), sig.get("neutral_pct"),
                        sig.get("avg_response_len") or 0,
                        json.dumps(sig.get("emotion_distribution", {})),
                        json.dumps(sig.get("response_ids", [])),
                    ),
                )
                row = await cur.fetchone()
                topic_ids[topic.name] = str(row[0])

        except Exception as exc:
            logger.error(
                "upsert_survey_topic_failed",
                topic_name=topic.name, survey_id=survey_id, error=str(exc),
                traceback=traceback.format_exc())

    return topic_ids


async def get_previous_topic_names(survey_id: str, conn) -> list[str]:
    """Fetch canonical topic names from prior runs for this survey."""
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT DISTINCT name FROM survey_topics WHERE survey_id = %s",
                (survey_id,),
            )
            rows = await cur.fetchall()
            return [row[0] for row in rows]
    except Exception as exc:
        logger.error("get_previous_topic_names_failed", survey_id=survey_id, error=str(exc), traceback=traceback.format_exc())
        return []


async def build_topic_hierarchy(
    topics: list[TopicItem],
    topic_db_ids: dict[str, str],
    survey_id: str,
    org_id: str,
    run_id: str,
    time_window: str,
    conn,
) -> None:
    """Create or update parent topic records and link child topics to them.

    Parent records are virtual (not tied to a single cluster) — they aggregate
    all children's volume and sentiment. Only topics with parent_category set
    are processed; topics without one remain as root-level.
    """
    # Collect unique parent categories from this run
    parent_categories: dict[str, list[str]] = {}  # parent_name → [child_names]
    for topic in topics:
        if topic.parent_category:
            parent_categories.setdefault(topic.parent_category, []).append(topic.name)

    if not parent_categories:
        return

    parent_db_ids: dict[str, str] = {}

    for parent_name, child_names in parent_categories.items():
        try:
            # Upsert the parent record — INSERT if new, skip if the topic already
            # exists under any hierarchy_level (e.g. upsert_survey_topics already
            # created it as a regular topic with the same name).
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO survey_topics
                         (survey_id, org_id, run_id, time_window, name,
                          hierarchy_level, is_new, volume, sentiment_score,
                          dominant_emotion, effort_score, trending)
                       VALUES (%s,%s,%s,%s,%s, 0, false, 0, 0.0, 'neutral', 4.0, 'stable')
                       ON CONFLICT (survey_id, name, time_window) DO NOTHING
                       RETURNING id""",
                    (survey_id, org_id, run_id, time_window, parent_name),
                )
                row = await cur.fetchone()

            if row:
                parent_id = str(row[0])
            else:
                # Row already existed — look it up without filtering by hierarchy_level
                async with conn.cursor() as cur:
                    await cur.execute(
                        """SELECT id FROM survey_topics
                           WHERE survey_id = %s AND name = %s AND time_window = %s
                           LIMIT 1""",
                        (survey_id, parent_name, time_window),
                    )
                    existing = await cur.fetchone()
                if not existing:
                    continue
                parent_id = str(existing[0])

            parent_db_ids[parent_name] = parent_id

            # Link children → parent, mark hierarchy_level = 1
            for child_name in child_names:
                child_id = topic_db_ids.get(child_name)
                if child_id:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """UPDATE survey_topics
                               SET parent_topic_id = %s, hierarchy_level = 1
                               WHERE id = %s""",
                            (parent_id, child_id),
                        )

            # Commit child links before running the roll-up so the aggregate
            # subquery sees the updated parent_topic_id values.
            await conn.commit()

            # Roll up child aggregates into parent
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE survey_topics SET
                           volume = (
                             SELECT COALESCE(SUM(volume), 0)
                             FROM survey_topics WHERE parent_topic_id = %s
                           ),
                           sentiment_score = (
                             SELECT AVG(sentiment_score)
                             FROM survey_topics WHERE parent_topic_id = %s
                           ),
                           effort_score = (
                             SELECT AVG(effort_score)
                             FROM survey_topics WHERE parent_topic_id = %s
                           ),
                           sub_topic_count = (
                             SELECT COUNT(*) FROM survey_topics WHERE parent_topic_id = %s
                           )
                       WHERE id = %s""",
                    (parent_id, parent_id, parent_id, parent_id, parent_id),
                )

        except Exception as exc:
            logger.error(
                "build_topic_hierarchy_failed",
                parent_name=parent_name, error=str(exc),
                traceback=traceback.format_exc())

    await conn.commit()
