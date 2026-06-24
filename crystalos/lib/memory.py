"""CrystalOS 4-Layer Memory System for Crystal Intelligence.

Layer 0 (L0) — Tool call memoization: per-session in-memory dict, ~0ms
Layer 1 (L1) — Semantic response cache: Redis, 24h TTL, exact hash match
Layer 2 (L2) — Thread compression: structured context_state in crystal_threads
Layer 3 (L3) — Survey facts cache: Redis, invalidated at publish
Layer 4 (L4) — Org memory: Postgres crystal_org_memory (pgvector optional)

All layers degrade gracefully when their backend is unavailable.
All Redis keys and thresholds are driven by constants — never hardcoded.

Usage:
    mm = get_memory_manager(redis=redis_client, db_pool=db_pool)
    facts = await mm.get_survey_facts(survey_id)
    ctx = await mm.build_context_injection(org_id, user_id, survey_id, thread_id, turns, msgs)
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

from crystalos.lib.logger import logger

_manager: "MemoryManager | None" = None


def get_memory_manager(redis: Any = None, db_pool: Any = None) -> "MemoryManager":
    global _manager
    if _manager is None:
        _manager = MemoryManager(redis=redis, db_pool=db_pool)
    return _manager


# ── Conversational heuristics ──────────────────────────────────────────────────

_NON_CACHEABLE_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"why did you",
        r"what did you mean",
        r"explain that",
        r"what do you think",
        r"tell me more about your",
        r"i disagree",
    ]
]


def _is_cacheable_question(question: str) -> bool:
    """Heuristic: returns True if the question is factual (cacheable)."""
    return not any(p.search(question) for p in _NON_CACHEABLE_PATTERNS)


class MemoryManager:
    """Unified interface to all CrystalOS memory layers."""

    def __init__(self, redis: Any = None, db_pool: Any = None) -> None:
        self._redis = redis        # redis.asyncio client or None
        self._db = db_pool         # psycopg pool or None

    # ── L0: Tool call memoization (per-session dict) ────────────────────────

    def get_tool_result(
        self, tool_cache: dict, tool_name: str, params: dict
    ) -> dict | None:
        """Return memoized tool result or None on cache miss."""
        key = self._tool_key(tool_name, params)
        return tool_cache.get(key)

    def set_tool_result(
        self, tool_cache: dict, tool_name: str, params: dict, result: dict
    ) -> None:
        """Cache tool result if it doesn't contain an error."""
        if "error" not in result:
            tool_cache[self._tool_key(tool_name, params)] = result

    def _tool_key(self, tool_name: str, params: dict) -> str:
        return f"{tool_name}:{json.dumps(params, sort_keys=True, default=str)}"

    # ── L1: Semantic response cache (Redis) ─────────────────────────────────

    async def get_semantic_cache(
        self, org_id: str, survey_id: str, question: str
    ) -> dict | None:
        """Return cached answer or None. Skips non-cacheable conversational questions."""
        if self._redis is None:
            return None
        if not _is_cacheable_question(question):
            return None
        key = self._l1_key(org_id, survey_id, question)
        try:
            raw = await self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.debug("l1_cache_read_error", error=str(exc))
        return None

    async def set_semantic_cache(
        self, org_id: str, survey_id: str, question: str, answer: dict
    ) -> None:
        """Cache an answer. No-op if Redis unavailable or question is non-cacheable."""
        if self._redis is None:
            return
        if not _is_cacheable_question(question):
            return
        from crystalos.lib.constants import SEMANTIC_CACHE_TTL_HOURS
        key = self._l1_key(org_id, survey_id, question)
        try:
            await self._redis.set(
                key,
                json.dumps(answer, ensure_ascii=False, default=str),
                ex=SEMANTIC_CACHE_TTL_HOURS * 3600,
            )
        except Exception as exc:
            logger.debug("l1_cache_write_error", error=str(exc))

    async def invalidate_survey_cache(self, org_id: str, survey_id: str) -> int:
        """Delete all L1 cache entries for a survey. Called at publish. Returns count."""
        if self._redis is None:
            return 0
        from crystalos.lib.constants import SEMANTIC_CACHE_KEY_PREFIX
        pattern = f"{SEMANTIC_CACHE_KEY_PREFIX}:{org_id}:{survey_id}:*"
        try:
            keys = await self._redis.keys(pattern)
            if keys:
                await self._redis.delete(*keys)
            return len(keys)
        except Exception as exc:
            logger.debug("l1_cache_invalidate_error", error=str(exc))
            return 0

    def _l1_key(self, org_id: str, survey_id: str, question: str) -> str:
        from crystalos.lib.constants import SEMANTIC_CACHE_KEY_PREFIX
        digest = hashlib.sha256(question.encode("utf-8")).hexdigest()[:16]
        return f"{SEMANTIC_CACHE_KEY_PREFIX}:{org_id}:{survey_id}:{digest}"

    # ── L2: Thread compression (Postgres crystal_threads) ──────────────────

    async def get_thread_context(self, thread_id: str) -> dict:
        """Return context_state JSON for a thread or {} if not found."""
        if self._db is None:
            return {}
        try:
            from crystalos.lib import db
            rows = await db.execute_query(
                "SELECT context_state FROM crystal_threads WHERE id = %s LIMIT 1",
                (thread_id,),
            )
            if rows and rows[0][0]:
                return rows[0][0] if isinstance(rows[0][0], dict) else json.loads(rows[0][0])
        except Exception as exc:
            logger.debug("l2_thread_context_read_error", thread_id=thread_id, error=str(exc))
        return {}

    def should_compress(self, turn_count: int) -> bool:
        """True if thread compression should run on this turn."""
        from crystalos.lib.constants import THREAD_COMPRESS_FIRST_TURN, THREAD_COMPRESS_INTERVAL
        if turn_count < THREAD_COMPRESS_FIRST_TURN:
            return False
        return (turn_count - THREAD_COMPRESS_FIRST_TURN) % THREAD_COMPRESS_INTERVAL == 0

    async def update_thread_context(
        self,
        thread_id: str,
        messages: list[dict],
        turn_count: int,
    ) -> dict:
        """Compress thread messages into structured context_state and persist to DB."""
        context_state = self._compress_messages(messages, turn_count)
        if self._db is None:
            return context_state
        try:
            from crystalos.lib import db
            await db.execute_query(
                """UPDATE crystal_threads
                   SET context_state = %s,
                       context_state_updated_at = now(),
                       turn_count = %s,
                       last_active_at = now()
                   WHERE id = %s""",
                (json.dumps(context_state), turn_count, thread_id),
            )
        except Exception as exc:
            logger.debug("l2_thread_context_write_error", thread_id=thread_id, error=str(exc))
        return context_state

    def _compress_messages(self, messages: list[dict], turn_count: int) -> dict:
        """Extract structured facts from raw message history."""
        from crystalos.lib.constants import THREAD_COMPRESS_FIRST_TURN
        decisions: list[dict] = []
        data_retrieved = {"topics_loaded": False, "metrics_loaded": False, "verbatims_count": 0}
        open_questions: list[str] = []
        user_preferences: dict = {"detail_level": "standard", "preferred_format": "prose"}

        decision_pattern = re.compile(
            r"\b(focus on|concentrate on|look at|analyze|let'?s focus|prioritize)\b", re.I
        )
        pref_bullet = re.compile(r"\b(bullet|bullet ?points?|list format)\b", re.I)
        pref_exec = re.compile(r"\b(executive|high.?level|brief|summary)\b", re.I)

        for i, msg in enumerate(messages):
            role = msg.get("role", "")
            content = str(msg.get("content", ""))
            turn_num = i // 2 + 1

            if role == "user":
                # Detect tool result references
                if "topic" in content.lower():
                    data_retrieved["topics_loaded"] = True
                if any(w in content.lower() for w in ["nps", "csat", "score", "metric"]):
                    data_retrieved["metrics_loaded"] = True

                # Detect decisions
                if decision_pattern.search(content):
                    topic_match = re.search(r"focus on (.+?)[\.\?!,]", content, re.I)
                    topic = topic_match.group(1)[:60] if topic_match else content[:40]
                    decisions.append({
                        "turn": turn_num,
                        "topic": topic,
                        "conclusion": content[:100],
                        "status": "active",
                        "supersedes_turn": None,
                    })

                # Detect preferences
                if pref_bullet.search(content):
                    user_preferences["preferred_format"] = "bullet points"
                if pref_exec.search(content):
                    user_preferences["detail_level"] = "executive"

                # Open questions (question mark in last N turns)
                if "?" in content and i >= len(messages) - 4:
                    open_questions.append(content[:80])

        # Decision supersession: later decision on same topic supersedes earlier
        for i, d in enumerate(decisions):
            for j in range(i + 1, len(decisions)):
                later = decisions[j]
                if d["topic"].lower()[:20] == later["topic"].lower()[:20]:
                    d["status"] = "superseded"
                    later["supersedes_turn"] = d["turn"]

        from crystalos.lib.constants import THREAD_COMPRESS_FIRST_TURN
        return {
            "schema_version": 2,
            "verbatim_turns": 2,
            "decisions": decisions,
            "data_retrieved": data_retrieved,
            "open_questions": open_questions[:3],
            "user_preferences": user_preferences,
            "last_active": datetime.now(timezone.utc).isoformat(),
        }

    def build_context_blocks(
        self,
        org_memory: list[dict],
        context_state: dict,
        survey_facts: dict,
        raw_turns: list[dict],
    ) -> list[dict]:
        """Assemble context blocks in the correct LLM injection order (G23 fix).

        Order (low attention → high attention):
          org_memory → context_state → raw_turns (last N) → survey_facts
        Survey facts go LAST — closest to user message = highest attention.
        """
        blocks: list[dict] = []
        if org_memory:
            blocks.append({
                "role": "system",
                "layer": "org_memory",
                "content": "[Org context from past sessions]:\n" + "\n".join(
                    f"- {m.get('fact', '')}" for m in org_memory
                ),
            })
        if context_state:
            blocks.append({
                "role": "system",
                "layer": "context_state",
                "content": f"[Conversation context]:\n{json.dumps(context_state, indent=2)}",
            })
        for msg in raw_turns:
            blocks.append(msg)
        if survey_facts:
            blocks.append({
                "role": "system",
                "layer": "survey_facts",
                "content": f"[Survey data]:\n{json.dumps(survey_facts, indent=2)}",
            })
        return blocks

    # ── L3: Survey facts cache (Redis) ─────────────────────────────────────

    async def get_survey_facts(self, survey_id: str) -> dict | None:
        """Return pre-computed survey facts or None if not cached."""
        if self._redis is None:
            return None
        key = self._l3_key(survey_id)
        try:
            raw = await self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.debug("l3_survey_facts_read_error", survey_id=survey_id, error=str(exc))
        return None

    async def set_survey_facts(self, survey_id: str, facts: dict) -> None:
        """Cache survey facts. No TTL — cleared at publish. Backup TTL as safety net."""
        if self._redis is None:
            return
        from crystalos.lib.constants import SURVEY_FACTS_BACKUP_TTL_HOURS
        key = self._l3_key(survey_id)
        try:
            await self._redis.set(
                key,
                json.dumps(facts, ensure_ascii=False, default=str),
                ex=SURVEY_FACTS_BACKUP_TTL_HOURS * 3600,
            )
        except Exception as exc:
            logger.debug("l3_survey_facts_write_error", survey_id=survey_id, error=str(exc))

    async def invalidate_survey_facts(self, survey_id: str) -> None:
        """Delete survey facts cache. Called at pipeline publish."""
        if self._redis is None:
            return
        try:
            await self._redis.delete(self._l3_key(survey_id))
        except Exception as exc:
            logger.debug("l3_survey_facts_invalidate_error", survey_id=survey_id, error=str(exc))

    async def warm_from_tool_results(self, survey_id: str, tool_results: dict) -> None:
        """G28 cold-start fix: populate L3 from Crystal tool results.

        Builds a minimal survey_facts dict from get_survey_overview and topic
        results so the next Crystal session avoids 3 cold-start tool calls.
        The pipeline's node_publish will overwrite this with authoritative data.
        """
        if self._redis is None:
            return
        overview = tool_results.get("get_survey_overview", {})
        if not overview or overview.get("error"):
            return
        facts = {
            "survey_id": survey_id,
            "computed_at": datetime.now(timezone.utc).isoformat(),
            "source": "crystal_cold_start",
            "response_count": overview.get("response_count", 0),
            "nps_score": overview.get("nps_score"),
            "csat_score": overview.get("csat_score"),
            "top_topics": overview.get("top_topics", [])[:5],
        }
        await self.set_survey_facts(survey_id, facts)
        logger.info("l3_warmed_from_tool_results", survey_id=survey_id)

    def _l3_key(self, survey_id: str) -> str:
        from crystalos.lib.constants import SURVEY_FACTS_KEY_PREFIX
        return f"{SURVEY_FACTS_KEY_PREFIX}:{survey_id}"

    # ── L4: Org memory (Postgres) ───────────────────────────────────────────

    async def get_org_memory(
        self,
        org_id: str,
        user_id: str,
        query_text: str,
        top_k: int | None = None,
    ) -> list[dict]:
        """Return most relevant org/user memory facts. Graceful if pgvector missing."""
        if self._db is None:
            return []
        from crystalos.lib.constants import ORG_MEMORY_TOP_K
        limit = top_k or ORG_MEMORY_TOP_K
        try:
            from crystalos.lib import db
            rows = await db.execute_query(
                """SELECT fact, memory_type, scope, confidence, created_at
                   FROM crystal_org_memory
                   WHERE org_id = %s
                     AND (user_id = %s OR (scope = 'org' AND user_id IS NULL))
                     AND (expires_at IS NULL OR expires_at > now())
                   ORDER BY
                     CASE WHEN scope = 'user' AND user_id = %s THEN 0 ELSE 1 END,
                     confidence DESC,
                     created_at DESC
                   LIMIT %s""",
                (org_id, user_id, user_id, limit * 2),
            )
            if not rows:
                return []
            return [
                {
                    "fact": r[0],
                    "memory_type": r[1],
                    "scope": r[2],
                    "confidence": float(r[3] or 1.0),
                }
                for r in rows[:limit]
            ]
        except Exception as exc:
            logger.debug("l4_org_memory_read_error", org_id=org_id, error=str(exc))
            return []

    async def write_org_memory(
        self,
        org_id: str,
        user_id: str | None,
        scope: str,
        memory_type: str,
        fact: str,
        confidence: float = 1.0,
        source_thread: str | None = None,
    ) -> None:
        """Persist a fact to crystal_org_memory. Embedding stored NULL for now."""
        if self._db is None:
            return
        from crystalos.lib.constants import ORG_MEMORY_SWEEP_INTERVAL_MIN
        try:
            from crystalos.lib import db
            await db.execute_query(
                """INSERT INTO crystal_org_memory
                   (org_id, user_id, scope, memory_type, fact, source_thread, confidence)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (org_id, user_id, scope, memory_type, fact[:1000], source_thread, confidence),
            )
        except Exception as exc:
            logger.debug("l4_org_memory_write_error", org_id=org_id, error=str(exc))

    async def sweep_stale_threads(self) -> int:
        """G16 fix: Background job — write L4 facts for threads inactive > N minutes.

        Returns number of threads swept.
        """
        if self._db is None:
            return 0
        from crystalos.lib.constants import ORG_MEMORY_SWEEP_INTERVAL_MIN
        swept = 0
        try:
            from crystalos.lib import db
            stale_threads = await db.execute_query(
                """SELECT id, org_id, user_id, messages
                   FROM crystal_threads
                   WHERE last_active_at < now() - interval '%s minutes'
                     AND context_state_updated_at < last_active_at
                   LIMIT 50""",
                (ORG_MEMORY_SWEEP_INTERVAL_MIN,),
            )
            for row in (stale_threads or []):
                thread_id, org_id, user_id, messages = row
                try:
                    await self._extract_and_write_org_memory(
                        thread_id=str(thread_id),
                        org_id=str(org_id),
                        user_id=str(user_id) if user_id else None,
                        messages=messages or [],
                    )
                    await db.execute_query(
                        """UPDATE crystal_threads
                           SET context_state_updated_at = now()
                           WHERE id = %s""",
                        (thread_id,),
                    )
                    swept += 1
                except Exception as exc:
                    logger.debug("sweep_thread_failed", thread_id=thread_id, error=str(exc))
        except Exception as exc:
            logger.debug("l4_sweep_error", error=str(exc))
        if swept:
            logger.info("l4_sweep_complete", threads_swept=swept)
        return swept

    async def _extract_and_write_org_memory(
        self,
        thread_id: str,
        org_id: str,
        user_id: str | None,
        messages: list[dict],
    ) -> None:
        """Extract memorable facts from a thread and write to L4."""
        explicit_pref = re.compile(
            r"\b(always|please always|i prefer|i want|show me in|use)\b.{0,50}\b(bullets?|list|summary|executive)\b",
            re.I,
        )
        for msg in messages:
            if msg.get("role") != "user":
                continue
            content = str(msg.get("content", ""))
            if explicit_pref.search(content):
                await self.write_org_memory(
                    org_id=org_id,
                    user_id=user_id,
                    scope="user",
                    memory_type="preference",
                    fact=content[:200],
                    confidence=0.85,
                    source_thread=thread_id,
                )
                break

    # ── Combined context builder ────────────────────────────────────────────

    async def build_context_injection(
        self,
        org_id: str,
        user_id: str,
        survey_id: str,
        thread_id: str,
        turn_count: int,
        raw_messages: list[dict],
    ) -> dict:
        """Assemble all memory layers into a context dict for Crystal.

        Returns:
            {
                "org_memory_facts": [...],  # L4
                "context_state": {...},     # L2
                "survey_facts": {...} | None, # L3
                "verbatim_turns": 2,
            }
        """
        from crystalos.lib.constants import CRYSTAL_CONVERSATION_WINDOW

        # L4 — org memory
        org_facts = await self.get_org_memory(org_id, user_id, "")

        # L2 — thread compression
        context_state: dict = {}
        if self.should_compress(turn_count) and raw_messages:
            context_state = await self.update_thread_context(thread_id, raw_messages, turn_count)
        else:
            context_state = await self.get_thread_context(thread_id)

        # L3 — survey facts
        survey_facts = await self.get_survey_facts(survey_id)

        return {
            "org_memory_facts": org_facts,
            "context_state": context_state,
            "survey_facts": survey_facts,
            "verbatim_turns": context_state.get("verbatim_turns", 2),
        }
