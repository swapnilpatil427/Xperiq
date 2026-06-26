"""Tests for scale features: example bank diversity, SLA checker, consolidation.

Covers: per-org cap, near-duplicate skip, consolidation, hourly rollup, SLA breach.
All tests use mocks — no DB or LLM calls.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_skill_runtime():
    from crystalos.lib.skill_runtime import SkillRuntime
    return SkillRuntime()


# ── Example bank: org cap ─────────────────────────────────────────────────────

class TestExampleBankOrgCapEnforced:
    """When org has hit 20% cap, no new example is inserted."""

    @pytest.mark.asyncio
    async def test_example_bank_org_cap_enforced(self):
        runtime = _make_skill_runtime()
        ctx = {"org_id": "org-saturated"}

        with patch("crystalos.lib.skill_runtime.json", json), \
             patch("crystalos.lib.db.execute_query") as mock_db:

            # Total = 50 examples, org cap = 50 * 0.20 = 10
            # org already has 10 examples → should skip
            mock_db.side_effect = [
                [(50,)],   # total count query
                [(10,)],   # org count query
            ]

            await runtime._write_example_async(
                skill_name="insight-narrator",
                skill_version="1.0.0",
                eval_score=0.9,
                input_data={"query": "test"},
                output={"answer": "out"},
                ctx=ctx,
            )

        # Should only have called the two count queries, no INSERT
        assert mock_db.call_count == 2
        for mock_call in mock_db.call_args_list:
            sql = mock_call.args[0] if mock_call.args else mock_call.kwargs.get("sql", "")
            assert "INSERT" not in sql.upper(), f"Unexpected INSERT: {sql}"


class TestExampleBankDedupSkipsSimilar:
    """Near-duplicate detection skips INSERT when pgvector returns a match."""

    @pytest.mark.asyncio
    async def test_example_bank_dedup_skips_similar(self):
        runtime = _make_skill_runtime()
        ctx = {"org_id": "org-test"}

        mock_embedding = [0.1] * 1536

        with patch("crystalos.lib.skill_runtime.json", json), \
             patch("crystalos.lib.db.execute_query") as mock_db, \
             patch("crystalos.tools.embeddings.embed_text", new=AsyncMock(return_value=mock_embedding)):

            # Total = 10 (under cap), org = 0 (under cap)
            # Dedup check returns 1 row (duplicate found)
            mock_db.side_effect = [
                [(10,)],   # total count
                [(0,)],    # org count
                [(("existing-id-123",),)],  # dedup check returns match
            ]

            await runtime._write_example_async(
                skill_name="insight-narrator",
                skill_version="1.0.0",
                eval_score=0.92,
                input_data={"query": "tell me about NPS"},
                output={"answer": "NPS is..."},
                ctx=ctx,
            )

        # No INSERT should have been called
        insert_calls = [
            c for c in mock_db.call_args_list
            if "INSERT" in (c.args[0] if c.args else "").upper()
        ]
        assert len(insert_calls) == 0


class TestConsolidateBankRemovesRedundant:
    """_consolidate_example_bank removes too-similar examples."""

    @pytest.mark.asyncio
    async def test_consolidate_bank_removes_redundant(self):
        from crystalos.lib.skill_runtime import _consolidate_example_bank

        # Build two very similar embeddings (cosine sim > 0.85)
        import math
        base = [1.0] + [0.0] * 1535
        # Nearly identical embedding
        similar = [0.999] + [0.001] * 1535

        rows = [
            ("id-001", '{"q": "what is NPS?"}', '{}', 0.95),
            ("id-002", '{"q": "what is NPS score?"}', '{}', 0.88),  # similar to id-001
            ("id-003", '{"q": "how to improve CSAT?"}', '{}', 0.82),
        ]

        with patch("crystalos.lib.db.execute_query") as mock_db, \
             patch("crystalos.tools.embeddings.embed_text") as mock_embed:

            mock_db.side_effect = [
                rows,         # initial SELECT
                [],           # DELETE id-002
                [],           # INSERT into skill_example_refreshes
            ]

            # id-001 and id-002 are similar; id-003 is different
            mock_embed.side_effect = [
                base,         # embedding for id-001
                similar,      # embedding for id-002 (very similar to base)
                [0.0, 1.0] + [0.0] * 1534,  # embedding for id-003 (orthogonal)
            ]

            await _consolidate_example_bank("insight-narrator")

        # At least one DELETE should have been issued
        delete_calls = [
            c for c in mock_db.call_args_list
            if "DELETE" in (c.args[0] if c.args else "").upper()
        ]
        assert len(delete_calls) >= 1


# ── Hourly rollup ─────────────────────────────────────────────────────────────

class TestHourlyRollupAggregatesCorrectly:
    """_rollup_feedback_hour runs INSERT ... ON CONFLICT DO UPDATE."""

    @pytest.mark.asyncio
    async def test_hourly_rollup_aggregates_correctly(self):
        from crystalos.scheduler import _rollup_feedback_hour

        mock_conn = AsyncMock()
        mock_cur = AsyncMock()
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=False)
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=mock_cur)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_conn)

        with patch("crystalos.scheduler._pool_conn", return_value=mock_pool):
            await _rollup_feedback_hour()

        # cursor.execute should have been called with INSERT ... ON CONFLICT
        execute_calls = mock_cur.execute.call_args_list
        assert len(execute_calls) >= 1
        sql = execute_calls[0].args[0]
        assert "INSERT" in sql.upper()
        assert "feedback_hourly_rollups" in sql
        assert "ON CONFLICT" in sql.upper()


# ── Quality SLA checker ───────────────────────────────────────────────────────

class TestQualitySlaCheckerFiresBreachEvent:
    """_check_quality_sla_compliance inserts breach when positive_rate is below threshold."""

    @pytest.mark.asyncio
    async def test_quality_sla_checker_fires_breach_event(self):
        from crystalos.scheduler import _check_quality_sla_compliance

        executed_sqls = []
        call_count = [0]  # mutable counter for fetchall calls

        # First fetchall: SLA configs; subsequent fetchall: empty (brand loop uses fetchone)
        def _make_fetchall():
            async def _fetchall():
                call_count[0] += 1
                if call_count[0] == 1:
                    # SLA configs query
                    return [("brand-001", 0.700, 0.750, "7 days")]
                return []
            return _fetchall

        # fetchone: rollup data for the brand — 100 total, 50 positive (50% rate — breach!)
        async def _fetchone():
            return (100, 50, 0.72)

        async def _execute(sql, params=None):
            executed_sqls.append(sql)

        mock_cur = AsyncMock()
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=False)
        mock_cur.execute = _execute
        mock_cur.fetchall = _make_fetchall()
        mock_cur.fetchone = _fetchone

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=mock_cur)
        mock_conn.commit = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_conn)

        with patch("crystalos.scheduler._pool_conn", return_value=mock_pool):
            await _check_quality_sla_compliance()

        # Should have executed at least one INSERT into quality_sla_breaches
        breach_inserts = [s for s in executed_sqls if "quality_sla_breaches" in s]
        assert len(breach_inserts) >= 1, (
            f"No breach insert found. Executed SQLs: {executed_sqls}"
        )
