"""LLM-based topic discovery and canonical topic registry management.

Takes raw ABSA clusters and produces canonical topic names, detects new topics
vs existing ones (fuzzy match without external libs), computes effort scores,
and upserts into survey_topics table.
"""
from __future__ import annotations

import json
from typing import Any

import structlog
from pydantic import BaseModel, Field

from agents.tools.metrics import compute_effort_score

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
    effort_score: float = Field(ge=1.0, le=7.0, description="1-7, higher = more customer effort/frustration")


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


# ── Per-topic signal breakdown ────────────────────────────────────────────────

def compute_topic_signals(cluster: dict, all_responses: list[dict]) -> dict:
    """Compute per-topic signal breakdown from cluster data and response NPS scores.

    Returns a dict with fields matching the new survey_topics columns:
    positive_pct, negative_pct, neutral_pct, nps_avg, emotion_breakdown,
    avg_response_len, sample_response_ids.
    """
    texts = cluster.get("texts", [])
    if not texts:
        return {}

    response_ids = [str(t["response_id"]) for t in texts]

    # Build NPS lookup from all responses (keyed by str(id))
    resp_lookup: dict[str, dict] = {}
    for r in all_responses:
        rid = str(r.get("id") or r.get("response_id") or "")
        if rid:
            resp_lookup[rid] = r

    # Sentiment breakdown
    total = len(texts)
    pos_count  = sum(1 for t in texts if t.get("sentiment") == "positive")
    neg_count  = sum(1 for t in texts if t.get("sentiment") == "negative")
    neu_count  = total - pos_count - neg_count
    positive_pct = round(pos_count / max(1, total) * 100, 1)
    negative_pct = round(neg_count / max(1, total) * 100, 1)
    neutral_pct  = round(neu_count / max(1, total) * 100, 1)

    # NPS average for responses in this topic
    nps_scores = [
        resp_lookup[rid]["nps_score"]
        for rid in response_ids
        if rid in resp_lookup and resp_lookup[rid].get("nps_score") is not None
    ]
    nps_avg = round(sum(nps_scores) / len(nps_scores), 1) if nps_scores else None

    # Emotion distribution
    emotion_breakdown: dict[str, int] = {}
    for t in texts:
        e = t.get("emotion", "neutral")
        emotion_breakdown[e] = emotion_breakdown.get(e, 0) + 1

    # Average response length (words)
    word_counts = [len(t["text"].split()) for t in texts if t.get("text")]
    avg_response_len = round(sum(word_counts) / len(word_counts)) if word_counts else 0

    return {
        "positive_pct":       positive_pct,
        "negative_pct":       negative_pct,
        "neutral_pct":        neutral_pct,
        "nps_avg":            nps_avg,
        "emotion_breakdown":  emotion_breakdown,
        "avg_response_len":   avg_response_len,
        "sample_response_ids": response_ids[:5],
    }


# ── LLM-based topic discovery ────────────────────────────────────────────────

async def discover_topics(
    clusters: list[dict],
    previous_topic_names: list[str],
    call_agent_func,
) -> list[TopicItem]:
    """Discover canonical topics from ABSA clusters using LLM labeling.

    Args:
        clusters: From the cluster node — each has aspect, size, texts,
                  dominant_sentiment, dominant_emotion, avg_sentiment_score.
        previous_topic_names: Names of topics seen in prior runs (for new-topic detection).
        call_agent_func: The call_agent coroutine from openrouter.py.

    Returns:
        List of TopicItem with canonical names, is_new flags, effort scores, etc.
    """
    if not clusters:
        return []

    # Build cluster summaries for the LLM
    cluster_summaries = []
    for i, c in enumerate(clusters):
        sample_texts = [t["text"][:150] for t in c.get("texts", [])[:5]]
        cluster_summaries.append({
            "cluster_index": i,
            "raw_aspect": c.get("aspect", "general"),
            "size": c.get("size", len(c.get("texts", []))),
            "dominant_sentiment": c.get("dominant_sentiment", "neutral"),
            "dominant_emotion": c.get("dominant_emotion", "neutral"),
            "avg_sentiment_score": c.get("avg_sentiment_score", 0.0),
            "sample_texts": sample_texts,
        })

    system = (
        "You are a CX analyst. Label each survey feedback cluster with a canonical topic name. "
        "Names must be 1-4 words, title case (e.g. 'Response Time', 'Checkout Flow'). "
        "Return JSON matching the schema exactly."
    )
    user = (
        f"Clusters to label (JSON):\n{json.dumps(cluster_summaries, indent=2)}\n\n"
        f"Previous known topic names: {previous_topic_names}\n\n"
        "For each cluster return a TopicItem with: name (canonical, 1-4 words, title case), "
        "parent_category (broader theme that groups related topics, e.g. 'Onboarding' groups "
        "'Email Verification' and 'Password Reset'; use null for standalone topics with no clear parent), "
        "aliases (other ways this topic is mentioned), summary (1 sentence), "
        "volume (= cluster size), sentiment_score, dominant_emotion.\n"
        f"Return a TopicDiscoveryOutput JSON with a 'topics' list of {len(clusters)} items."
    )

    try:
        output, _ = await call_agent_func(
            agent_name="insight_topics",
            system=system,
            user=user,
            output_schema=TopicDiscoveryOutput,
        )
        topics = output.topics
    except Exception as exc:
        logger.warning("discover_topics_llm_failed", error=str(exc))
        # Fallback: use raw aspect labels as canonical names
        topics = []
        for c in clusters:
            aspect = c.get("aspect", "general")
            # Convert snake_case/lower to Title Case
            canonical = " ".join(word.capitalize() for word in aspect.replace("_", " ").split())
            size = c.get("size", len(c.get("texts", [])))
            all_texts = [t["text"] for t in c.get("texts", [])]
            topics.append(TopicItem(
                name=canonical,
                parent_category=None,
                aliases=[aspect] if aspect != canonical else [],
                summary=f"Customers mention '{canonical}' frequently with {c.get('dominant_sentiment', 'neutral')} sentiment.",
                volume=size,
                sentiment_score=float(c.get("avg_sentiment_score", 0.0)),
                dominant_emotion=c.get("dominant_emotion", "neutral"),
                effort_score=compute_effort_score(all_texts),
            ))
        # Mark new topics in fallback path too
        for topic in topics:
            topic.is_new = not _fuzzy_matches_any(topic.name, previous_topic_names)
        return topics

    # Enrich topics with is_new flag and effort_score from actual texts
    enriched: list[TopicItem] = []
    for i, topic in enumerate(topics):
        topic.is_new = not _fuzzy_matches_any(topic.name, previous_topic_names)

        # Compute effort score from cluster texts if available
        if i < len(clusters):
            cluster_texts = [t["text"] for t in clusters[i].get("texts", [])]
            topic.effort_score = compute_effort_score(cluster_texts)

        enriched.append(topic)

    return enriched


# ── DB upsert ────────────────────────────────────────────────────────────────

async def upsert_survey_topics(
    topics: list[TopicItem],
    survey_id: str,
    org_id: str,
    run_id: str,
    time_window: str,
    conn,
    topic_signals: dict[str, dict] | None = None,
) -> dict[str, str]:
    """Insert or update survey_topics rows. Returns {topic_name: db_id}."""
    if not topics:
        return {}

    topic_ids: dict[str, str] = {}
    signals = topic_signals or {}

    for topic in topics:
        sig = signals.get(topic.name, {})
        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT id, sentiment_score, volume
                       FROM survey_topics
                       WHERE survey_id = %s AND name = %s AND time_window = %s
                       LIMIT 1""",
                    (survey_id, topic.name, time_window),
                )
                existing = await cur.fetchone()

            if existing:
                existing_id = str(existing[0])
                prev_sentiment = float(existing[1] or 0)
                sentiment_delta = topic.sentiment_score - prev_sentiment
                if abs(sentiment_delta) < 0.05:
                    trending = "stable"
                elif sentiment_delta > 0:
                    trending = "up"
                else:
                    trending = "down"

                async with conn.cursor() as cur:
                    await cur.execute(
                        """UPDATE survey_topics SET
                               volume = %s, sentiment_score = %s,
                               dominant_emotion = %s, effort_score = %s,
                               trending = %s, last_seen_at = NOW(), run_id = %s,
                               nps_avg = %s, positive_pct = %s, negative_pct = %s,
                               neutral_pct = %s, avg_response_len = %s,
                               emotion_breakdown = %s, sample_response_ids = %s
                           WHERE id = %s""",
                        (
                            topic.volume, topic.sentiment_score,
                            topic.dominant_emotion, topic.effort_score,
                            trending, run_id,
                            sig.get("nps_avg"), sig.get("positive_pct"),
                            sig.get("negative_pct"), sig.get("neutral_pct"),
                            sig.get("avg_response_len"),
                            json.dumps(sig.get("emotion_breakdown", {})),
                            json.dumps(sig.get("sample_response_ids", [])),
                            existing_id,
                        ),
                    )
                topic_ids[topic.name] = existing_id

            else:
                trending = "new" if topic.is_new else "stable"
                async with conn.cursor() as cur:
                    await cur.execute(
                        """INSERT INTO survey_topics (
                               survey_id, org_id, run_id, time_window,
                               name, aliases, is_new,
                               volume, sentiment_score, dominant_emotion,
                               effort_score, trending,
                               nps_avg, positive_pct, negative_pct, neutral_pct,
                               avg_response_len, emotion_breakdown, sample_response_ids
                           ) VALUES (%s,%s,%s,%s, %s,%s,%s, %s,%s,%s, %s,%s, %s,%s,%s,%s, %s,%s,%s)
                           RETURNING id""",
                        (
                            survey_id, org_id, run_id, time_window,
                            topic.name, topic.aliases, topic.is_new,
                            topic.volume, topic.sentiment_score, topic.dominant_emotion,
                            topic.effort_score, trending,
                            sig.get("nps_avg"), sig.get("positive_pct"),
                            sig.get("negative_pct"), sig.get("neutral_pct"),
                            sig.get("avg_response_len"),
                            json.dumps(sig.get("emotion_breakdown", {})),
                            json.dumps(sig.get("sample_response_ids", [])),
                        ),
                    )
                    row = await cur.fetchone()
                    topic_ids[topic.name] = str(row[0])

        except Exception as exc:
            logger.warning(
                "upsert_survey_topic_failed",
                topic_name=topic.name, survey_id=survey_id, error=str(exc),
            )

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
        logger.warning("get_previous_topic_names_failed", survey_id=survey_id, error=str(exc))
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
            # Find or create the parent record
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT id FROM survey_topics
                       WHERE survey_id = %s AND name = %s AND time_window = %s
                         AND hierarchy_level = 0
                       LIMIT 1""",
                    (survey_id, parent_name, time_window),
                )
                row = await cur.fetchone()

            if row:
                parent_id = str(row[0])
            else:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """INSERT INTO survey_topics
                             (survey_id, org_id, run_id, time_window, name,
                              hierarchy_level, is_new, volume, sentiment_score,
                              dominant_emotion, effort_score, trending)
                           VALUES (%s,%s,%s,%s,%s, 0, false, 0, 0.0, 'neutral', 4.0, 'stable')
                           RETURNING id""",
                        (survey_id, org_id, run_id, time_window, parent_name),
                    )
                    parent_id = str((await cur.fetchone())[0])

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
            logger.warning(
                "build_topic_hierarchy_failed",
                parent_name=parent_name, error=str(exc),
            )

    await conn.commit()
