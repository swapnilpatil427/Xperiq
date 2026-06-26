"""Tests for A/B variant resolution and graduation in skill_registry.

Covers: consistent hashing, single/multi-variant resolution, manifest parsing,
graduation significance check, rollback, and the _check_significance helper.
"""
from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from crystalos.lib.skill_registry import SkillRegistry, SkillVariant
from crystalos.lib.cdx import _check_significance


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_skill_md(tmp_path: Path, name: str, variant: str = "default",
                   rollout_pct: int = 100, baseline_variant: str | None = None,
                   min_sample_size: int = 100) -> Path:
    d = tmp_path / name
    d.mkdir(exist_ok=True)
    baseline_line = f"baseline_variant: {baseline_variant}" if baseline_variant else ""
    (d / "SKILL.md").write_text(textwrap.dedent(f"""\
        ---
        name: {name}
        version: 1.0.0
        description: Test skill {name}
        variant: {variant}
        rollout_pct: {rollout_pct}
        {baseline_line}
        min_sample_size: {min_sample_size}
        ---
        Body text.
    """))
    return tmp_path


# ── resolve_variant tests ──────────────────────────────────────────────────────

class TestResolveVariant100PctAlwaysReturnsDefault:
    """When rollout_pct=100 and only one variant, always returns that variant."""

    def test_resolve_variant_100pct_always_returns_default(self, tmp_path):
        _make_skill_md(tmp_path, "insight-narrator", variant="default", rollout_pct=100)
        registry = SkillRegistry(skills_dir=tmp_path)
        registry._scan_skills()

        for user_id in ["user-001", "user-002", "org-a:user-99", "test-hash"]:
            result = registry.resolve_variant("insight-narrator", f"{user_id}:insight-narrator")
            assert result is not None
            assert result["variant"] == "default"
            assert result["name"] == "insight-narrator"


class TestResolveVariant10PctSplitConsistentPerUser:
    """10% rollout: only ~10% of deterministic hashes fall into challenger bucket."""

    def test_resolve_variant_10pct_split_consistent_per_user(self, tmp_path):
        # Default variant: 90%, challenger: 10%
        _make_skill_md(tmp_path, "insight-narrator", variant="default", rollout_pct=90)
        d = tmp_path / "insight-narrator@challenger"
        d.mkdir()
        (d / "SKILL.md").write_text(textwrap.dedent("""\
            ---
            name: insight-narrator@challenger
            version: 1.1.0
            description: Test skill challenger
            variant: challenger
            rollout_pct: 10
            baseline_variant: default
            min_sample_size: 50
            ---
            Body
        """))
        registry = SkillRegistry(skills_dir=tmp_path)
        registry._scan_skills()

        # Test 200 different hashes — challenger should get ~10% (allow ±5%)
        challenger_count = 0
        total = 200
        for i in range(total):
            result = registry.resolve_variant("insight-narrator", f"user-{i:04d}:insight-narrator")
            if result and result.get("variant") == "challenger":
                challenger_count += 1

        challenger_pct = challenger_count / total
        # Expect between 5% and 20% — broad range for hash distribution
        assert 0.05 <= challenger_pct <= 0.20, f"challenger_pct={challenger_pct:.2%} out of range"


class TestResolveVariantSameUserSameVariant:
    """Same user always gets same variant (deterministic hashing)."""

    def test_resolve_variant_same_user_same_variant(self, tmp_path):
        _make_skill_md(tmp_path, "insight-narrator", variant="default", rollout_pct=80)
        d = tmp_path / "insight-narrator@v2"
        d.mkdir()
        (d / "SKILL.md").write_text(textwrap.dedent("""\
            ---
            name: insight-narrator@v2
            version: 2.0.0
            description: Test v2
            variant: v2
            rollout_pct: 20
            baseline_variant: default
            min_sample_size: 100
            ---
            Body
        """))
        registry = SkillRegistry(skills_dir=tmp_path)
        registry._scan_skills()

        user_hash = "user-12345:insight-narrator"
        # Call 5 times — must get same result every time
        results = [registry.resolve_variant("insight-narrator", user_hash) for _ in range(5)]
        variants_seen = {r["variant"] for r in results if r}
        assert len(variants_seen) == 1, f"Got multiple variants for same user: {variants_seen}"


class TestSkillManifestParsesVariantFields:
    """_parse_skill_md correctly extracts variant frontmatter fields."""

    def test_skill_manifest_parses_variant_fields(self, tmp_path):
        d = tmp_path / "my-skill"
        d.mkdir()
        (d / "SKILL.md").write_text(textwrap.dedent("""\
            ---
            name: my-skill
            version: 2.0.0
            description: A test skill
            variant: challenger
            rollout_pct: 15
            baseline_variant: default
            min_sample_size: 200
            ---
            Body
        """))
        registry = SkillRegistry(skills_dir=tmp_path)
        registry._scan_skills()

        meta = registry.get_skill_meta("my-skill")
        assert meta is not None
        assert meta["variant"] == "challenger"
        assert meta["rollout_pct"] == 15
        assert meta["baseline_variant"] == "default"
        assert meta["min_sample_size"] == 200


# ── Graduation tests ──────────────────────────────────────────────────────────

class TestGraduationRequiresMinSampleSize:
    """Graduate endpoint returns 422 if challenger has insufficient samples."""

    def test_graduation_requires_min_sample_size(self):
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from crystalos.lib.cdx import router

        with patch("crystalos.lib.cdx.get_registry") as mock_reg, \
             patch("crystalos.lib.cdx.db") as mock_db:

            mock_registry = MagicMock()
            mock_registry.list_variants.return_value = [{
                "skill_name": "insight-narrator@challenger",
                "variant": "challenger",
                "rollout_pct": 10,
                "baseline": "default",
                "min_sample_size": 100,
            }]
            mock_reg.return_value = mock_registry

            # Challenger only has 50 samples
            mock_db.execute_query = AsyncMock(return_value=[
                ("challenger", 50, 30),
                ("default", 500, 380),
            ])

            app = FastAPI()
            app.include_router(router)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/admin/skills/insight-narrator/variants/challenger/graduate",
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 422
        assert "Insufficient sample size" in resp.json()["detail"]


class TestGraduationRequiresStatisticalSignificance:
    """Graduate endpoint returns 422 if improvement is not statistically significant."""

    def test_graduation_requires_statistical_significance(self):
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from crystalos.lib.cdx import router

        with patch("crystalos.lib.cdx.get_registry") as mock_reg, \
             patch("crystalos.lib.cdx.db") as mock_db:

            mock_registry = MagicMock()
            mock_registry.list_variants.return_value = [{
                "skill_name": "insight-narrator@challenger",
                "variant": "challenger",
                "rollout_pct": 10,
                "baseline": "default",
                "min_sample_size": 100,
            }]
            mock_reg.return_value = mock_registry

            # Challenger vs baseline — very similar pass rates (not significant)
            mock_db.execute_query = AsyncMock(return_value=[
                ("challenger", 200, 150),    # 75% pass rate
                ("default", 2000, 1500),     # 75% pass rate — no improvement
            ])

            app = FastAPI()
            app.include_router(router)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/admin/skills/insight-narrator/variants/challenger/graduate",
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 422
        assert "Not statistically significant" in resp.json()["detail"]


class TestGraduationSetsRolloutTo100:
    """Graduate endpoint returns success when significance passes."""

    def test_graduation_sets_rollout_to_100(self):
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from crystalos.lib.cdx import router

        with patch("crystalos.lib.cdx.get_registry") as mock_reg, \
             patch("crystalos.lib.cdx.db") as mock_db:

            mock_registry = MagicMock()
            mock_registry.list_variants.return_value = [{
                "skill_name": "insight-narrator@challenger",
                "variant": "challenger",
                "rollout_pct": 10,
                "baseline": "default",
                "min_sample_size": 100,
            }]
            mock_reg.return_value = mock_registry

            # Challenger: 92% pass rate vs baseline 70% — significant improvement
            mock_db.execute_query = AsyncMock(return_value=[
                ("challenger", 200, 184),   # 92% pass rate
                ("default", 2000, 1400),    # 70% pass rate
            ])

            app = FastAPI()
            app.include_router(router)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/admin/skills/insight-narrator/variants/challenger/graduate",
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["graduated"] is True
        assert data["variant"] == "challenger"
        assert "p_value" in data
        assert data["p_value"] < 0.05


class TestRollbackSetsChallengerto0:
    """Rollback endpoint returns success with rolled_back=True."""

    def test_rollback_sets_challenger_to_0(self):
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from crystalos.lib.cdx import router

        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        resp = client.post(
            "/api/admin/skills/insight-narrator/variants/challenger/rollback",
            headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["rolled_back"] is True
        assert data["variant"] == "challenger"
        assert "rollout_pct=0" in data["message"]


# ── Statistical significance tests ───────────────────────────────────────────

class TestCheckSignificance:
    """_check_significance correctly identifies significant/non-significant results."""

    def test_check_significance_significant_improvement(self):
        # Challenger 92% vs baseline 70% at n=200 — should be significant
        is_sig, p_val = _check_significance(
            baseline_passes=1400,
            baseline_total=2000,
            challenger_passes=184,
            challenger_total=200,
        )
        assert is_sig is True
        assert p_val < 0.05

    def test_check_significance_not_significant(self):
        # Same rate — no improvement
        is_sig, p_val = _check_significance(
            baseline_passes=750,
            baseline_total=1000,
            challenger_passes=75,
            challenger_total=100,
        )
        assert is_sig is False
        assert p_val > 0.05

    def test_check_significance_zero_baseline_total(self):
        is_sig, p_val = _check_significance(
            baseline_passes=0,
            baseline_total=0,
            challenger_passes=10,
            challenger_total=100,
        )
        assert is_sig is False
        assert p_val == 1.0

    def test_check_significance_zero_challenger_total(self):
        is_sig, p_val = _check_significance(
            baseline_passes=100,
            baseline_total=200,
            challenger_passes=0,
            challenger_total=0,
        )
        assert is_sig is False
        assert p_val == 1.0
