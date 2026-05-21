"""Unit tests for checkpoint blob schema migration (agents/lib/checkpoint_store.py).

Tests cover:
  - CURRENT_SCHEMA_VERSION constant
  - migrate_blob() idempotency and v0→v1 upgrade path
  - _migrate_v0_to_v1() key renaming and safe defaults
"""
import pytest

from agents.lib.checkpoint_store import migrate_blob, _migrate_v0_to_v1, CURRENT_SCHEMA_VERSION


# ── Schema version constant ───────────────────────────────────────────────────

def test_current_schema_version_is_1():
    """CURRENT_SCHEMA_VERSION must equal 1."""
    assert CURRENT_SCHEMA_VERSION == 1


# ── migrate_blob() idempotency ────────────────────────────────────────────────

def test_migrate_blob_v1_is_idempotent():
    """A blob already at schema_version=1 is returned unchanged."""
    blob = {
        "schema_version": 1,
        "survey_id": "s1",
        "org_id": "org-1",
        "checkpoint_number": 3,
        "response_count": 150,
        "nps": 42.0,
        "csat": 3.8,
        "ces": None,
        "topics": ["Shipping", "Support"],
        "insights": [{"headline": "NPS is 42"}],
        "metrics": {"nps": 42.0},
        "delta": {"nps_delta": 5},
        "generated_at": "2025-01-15T12:00:00Z",
    }
    result = migrate_blob(blob)
    assert result is blob  # same object returned — no copy made


# ── migrate_blob() v0 → v1 upgrade ───────────────────────────────────────────

def test_migrate_blob_v0_adds_schema_version():
    """A blob without schema_version (v0) gets schema_version=1 after migration."""
    blob = {"survey_id": "s1", "nps_at_checkpoint": 42.0}
    result = migrate_blob(blob)
    assert result["schema_version"] == 1


def test_migrate_v0_renames_nps_at_checkpoint():
    """v0 field nps_at_checkpoint is renamed to 'nps' in v1."""
    blob = {"survey_id": "s1", "nps_at_checkpoint": 42.0}
    result = migrate_blob(blob)
    assert result["nps"] == 42.0
    assert "nps_at_checkpoint" not in result


def test_migrate_v0_renames_csat_at_checkpoint():
    """v0 field csat_at_checkpoint is renamed to 'csat' in v1."""
    blob = {"survey_id": "s1", "csat_at_checkpoint": 3.8}
    result = migrate_blob(blob)
    assert result["csat"] == 3.8
    assert "csat_at_checkpoint" not in result


def test_migrate_v0_renames_response_count():
    """v0 field response_count_at_checkpoint is renamed to 'response_count' in v1."""
    blob = {"survey_id": "s1", "response_count_at_checkpoint": 150}
    result = migrate_blob(blob)
    assert result["response_count"] == 150
    assert "response_count_at_checkpoint" not in result


def test_migrate_v0_renames_delta_from_prior():
    """v0 field delta_from_prior is renamed to 'delta' in v1."""
    blob = {"survey_id": "s1", "delta_from_prior": {"nps_delta": 3}}
    result = migrate_blob(blob)
    assert result["delta"] == {"nps_delta": 3}
    assert "delta_from_prior" not in result


def test_migrate_v0_sets_safe_defaults():
    """Empty v0 blob gets safe defaults for all required v1 fields."""
    result = migrate_blob({})
    assert result["survey_id"] == ""
    assert result["topics"] == []
    assert result["insights"] == []
    assert result["schema_version"] == 1


# ── _migrate_v0_to_v1() direct call ──────────────────────────────────────────

def test_migrate_blob_v0_to_v1_direct():
    """_migrate_v0_to_v1 called directly produces the same result as migrate_blob."""
    blob = {
        "survey_id": "s2",
        "nps_at_checkpoint": 50.0,
        "response_count_at_checkpoint": 200,
    }
    result_direct = _migrate_v0_to_v1(blob)
    result_via_migrate = migrate_blob(dict(blob))

    assert result_direct["schema_version"] == 1
    assert result_direct["nps"] == 50.0
    assert result_direct["response_count"] == 200
    assert result_via_migrate["nps"] == result_direct["nps"]
    assert result_via_migrate["response_count"] == result_direct["response_count"]


# ── Double-migration safety ───────────────────────────────────────────────────

def test_migrate_blob_idempotent_multiple_calls():
    """Calling migrate_blob twice on the same v0 blob produces the same result."""
    blob = {
        "survey_id": "s3",
        "nps_at_checkpoint": 35.0,
        "csat_at_checkpoint": 4.1,
        "response_count_at_checkpoint": 75,
        "delta_from_prior": {"nps_delta": -2},
    }
    first = migrate_blob(dict(blob))
    second = migrate_blob(dict(first))  # second call on already-migrated blob

    assert first["schema_version"] == 1
    assert second["schema_version"] == 1
    assert first["nps"] == second["nps"]
    assert first["csat"] == second["csat"]
    assert first["response_count"] == second["response_count"]
    assert first["delta"] == second["delta"]
