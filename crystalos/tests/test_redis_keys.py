"""Tests for K (Redis key builder) — brand isolation and namespace correctness."""
from __future__ import annotations

import pytest

from crystalos.lib.redis_keys import K


# ── Namespace tests ───────────────────────────────────────────────────────────

def test_ns_with_brand():
    """Brand namespace uses brand:{id} prefix."""
    ns = K._ns("marriott-001")
    assert ns == "brand:marriott-001"


def test_ns_without_brand_uses_global():
    """None brand_id returns 'global' namespace."""
    ns = K._ns(None)
    assert ns == "global"


# ── rate_limit tests ──────────────────────────────────────────────────────────

def test_rate_limit_with_brand():
    """Rate limit key includes brand namespace."""
    key = K.rate_limit("marriott-001", "org-abc")
    assert key == "brand:marriott-001:crystal:org-abc:rpm"


def test_rate_limit_without_brand_uses_global():
    """Rate limit key with no brand uses global namespace."""
    key = K.rate_limit(None, "org-abc")
    assert key == "global:crystal:org-abc:rpm"


def test_rate_limit_includes_org_id():
    """Rate limit key contains the org_id."""
    key = K.rate_limit("brand-x", "org-unique-123")
    assert "org-unique-123" in key


# ── semantic_cache tests ──────────────────────────────────────────────────────

def test_semantic_cache_namespaced():
    """Semantic cache key is brand-namespaced."""
    key = K.semantic_cache("hilton-002", "org-xyz", "hash123")
    assert key == "brand:hilton-002:semantic_cache:org-xyz:hash123"


def test_semantic_cache_without_brand():
    """Semantic cache with no brand uses global namespace."""
    key = K.semantic_cache(None, "org-xyz", "hash456")
    assert key == "global:semantic_cache:org-xyz:hash456"


def test_semantic_cache_includes_hash():
    """Semantic cache key includes the key_hash."""
    key_hash = "abc123def456"
    key = K.semantic_cache("brand-a", "org-1", key_hash)
    assert key_hash in key


# ── survey_facts tests ────────────────────────────────────────────────────────

def test_survey_facts_namespaced():
    """Survey facts key is brand-namespaced."""
    key = K.survey_facts("accenture-003", "org-acme", "survey-001")
    assert key == "brand:accenture-003:survey_facts:org-acme:survey-001"


# ── progressive_tier tests ────────────────────────────────────────────────────

def test_progressive_tier_namespaced():
    """Progressive tier key is brand-namespaced."""
    key = K.progressive_tier("marriott-001", "survey-xyz", "first_voices")
    assert key == "brand:marriott-001:tier:survey-xyz:first_voices"


def test_progressive_tier_without_brand():
    """Progressive tier with no brand uses global namespace."""
    key = K.progressive_tier(None, "survey-abc", "early_signals")
    assert key == "global:tier:survey-abc:early_signals"


# ── thread_lock tests ─────────────────────────────────────────────────────────

def test_thread_lock_namespaced():
    """Thread lock key is brand-namespaced."""
    key = K.thread_lock("brand-z", "survey-999", "org-zzz")
    assert key == "brand:brand-z:thread_lock:org-zzz:survey-999"


# ── Cross-brand isolation tests ───────────────────────────────────────────────

def test_no_two_brands_share_prefix():
    """Two different brands produce different key prefixes — no collision."""
    brand_a = "marriott-001"
    brand_b = "hilton-002"
    org_id = "org-shared-xyz"

    key_a = K.rate_limit(brand_a, org_id)
    key_b = K.rate_limit(brand_b, org_id)

    assert key_a != key_b
    assert brand_a in key_a
    assert brand_b in key_b
    assert brand_b not in key_a
    assert brand_a not in key_b


def test_brand_key_does_not_overlap_with_global():
    """Brand namespace key never starts with 'global:'."""
    key = K.rate_limit("some-brand", "org-1")
    assert not key.startswith("global:")
    assert key.startswith("brand:")


def test_global_key_does_not_overlap_with_brand():
    """Global namespace key never contains 'brand:'."""
    key = K.rate_limit(None, "org-1")
    assert key.startswith("global:")
    assert "brand:" not in key


def test_same_org_different_brands_different_cache_keys():
    """Same org_id under different brands produces different semantic cache keys."""
    org_id = "org-duplicate"
    hash_val = "hash-abc"

    key_brand1 = K.semantic_cache("brand-1", org_id, hash_val)
    key_brand2 = K.semantic_cache("brand-2", org_id, hash_val)
    key_global = K.semantic_cache(None, org_id, hash_val)

    # All three keys must be distinct
    assert len({key_brand1, key_brand2, key_global}) == 3
