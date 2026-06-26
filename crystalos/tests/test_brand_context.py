"""Tests for BrandContext, _resolve_permissions, and ROLE_PERMISSIONS."""
from __future__ import annotations

import pytest

from crystalos.crystal.context import (
    BrandContext,
    CrystalContext,
    ROLE_PERMISSIONS,
    _resolve_permissions,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_brand(
    brand_id: str = "marriott-001",
    brand_name: str = "Marriott",
    permitted_features: frozenset[str] | None = None,
    restricted_features: frozenset[str] | None = None,
    **kwargs,
) -> BrandContext:
    return BrandContext(
        brand_id=brand_id,
        brand_name=brand_name,
        brand_persona=kwargs.get("brand_persona"),
        data_region=kwargs.get("data_region", "us"),
        plan_tier=kwargs.get("plan_tier", "enterprise"),
        permitted_features=permitted_features if permitted_features is not None else frozenset({"data:read", "data:export", "survey:write"}),
        restricted_features=restricted_features if restricted_features is not None else frozenset(),
        custom_instructions=kwargs.get("custom_instructions"),
        support_ticket_url=kwargs.get("support_ticket_url"),
        feature_request_url=kwargs.get("feature_request_url"),
    )


# ── BrandContext field tests ──────────────────────────────────────────────────

def test_brand_context_fields():
    """BrandContext stores all fields correctly."""
    brand = BrandContext(
        brand_id="test-brand-001",
        brand_name="Test Brand",
        brand_persona="Crystal Intelligence for Test Brand",
        data_region="eu",
        plan_tier="enterprise_plus",
        permitted_features=frozenset({"data:read", "data:export", "data:pii"}),
        restricted_features=frozenset({"workflow:write"}),
        custom_instructions="Always respond in English.",
        support_ticket_url="https://support.testbrand.com",
        feature_request_url="https://feedback.testbrand.com",
        max_tool_turns=15,
        thread_ttl_days=14,
        progressive_tiers=(5, 20, 50, 100),
    )

    assert brand.brand_id == "test-brand-001"
    assert brand.brand_name == "Test Brand"
    assert brand.brand_persona == "Crystal Intelligence for Test Brand"
    assert brand.data_region == "eu"
    assert brand.plan_tier == "enterprise_plus"
    assert "data:pii" in brand.permitted_features
    assert "workflow:write" in brand.restricted_features
    assert brand.custom_instructions == "Always respond in English."
    assert brand.support_ticket_url == "https://support.testbrand.com"
    assert brand.feature_request_url == "https://feedback.testbrand.com"
    assert brand.max_tool_turns == 15
    assert brand.thread_ttl_days == 14
    assert brand.progressive_tiers == (5, 20, 50, 100)


def test_brand_context_default_values():
    """BrandContext has sensible defaults for optional fields."""
    brand = BrandContext(
        brand_id="min-brand",
        brand_name="Minimal Brand",
        brand_persona=None,
        data_region="us",
        plan_tier="starter",
        permitted_features=frozenset(),
        restricted_features=frozenset(),
        custom_instructions=None,
        support_ticket_url=None,
        feature_request_url=None,
    )

    assert brand.max_tool_turns == 10
    assert brand.thread_ttl_days == 7
    assert brand.progressive_tiers == (10, 40, 100, 250)


def test_brand_context_is_frozen():
    """BrandContext is immutable (frozen dataclass)."""
    brand = make_brand()
    with pytest.raises((AttributeError, TypeError)):
        brand.brand_name = "Modified"  # type: ignore[misc]


# ── _resolve_permissions tests ────────────────────────────────────────────────

def test_resolve_permissions_viewer_intersects_brand():
    """Viewer gets only data:read if brand permits it."""
    brand = make_brand(permitted_features=frozenset({"data:read", "data:export", "data:pii"}))
    perms = _resolve_permissions(brand, "viewer")

    # viewer has data:read, brand permits data:read → intersection is data:read
    assert "data:read" in perms
    # viewer does NOT have data:export in role_perms → not in result
    assert "data:export" not in perms
    # viewer does NOT have data:pii → not in result
    assert "data:pii" not in perms


def test_resolve_permissions_admin_gets_all_brand_allows():
    """Admin with broad brand permits gets full allowed set."""
    brand = make_brand(
        permitted_features=frozenset({"data:read", "data:export", "data:pii", "survey:write", "workflow:write"}),
    )
    perms = _resolve_permissions(brand, "admin")

    # Admin role has all these, brand also permits them
    assert "data:read" in perms
    assert "data:export" in perms
    assert "data:pii" in perms
    assert "survey:write" in perms
    assert "workflow:write" in perms


def test_resolve_permissions_no_brand_uses_role_defaults():
    """Without brand context, permissions equal the role's default set."""
    perms_viewer = _resolve_permissions(None, "viewer")
    perms_admin = _resolve_permissions(None, "admin")
    perms_editor = _resolve_permissions(None, "editor")

    assert perms_viewer == ROLE_PERMISSIONS["viewer"]
    assert perms_admin == ROLE_PERMISSIONS["admin"]
    assert perms_editor == ROLE_PERMISSIONS["editor"]


def test_resolve_permissions_restricted_features_excluded():
    """Brand-restricted features are always excluded from effective perms."""
    brand = make_brand(
        permitted_features=frozenset({"data:read", "data:export", "data:pii"}),
        restricted_features=frozenset({"data:pii"}),
    )
    perms = _resolve_permissions(brand, "admin")

    # data:pii is in admin role and brand permitted_features, but restricted → excluded
    assert "data:pii" not in perms
    assert "data:read" in perms
    assert "data:export" in perms


def test_resolve_permissions_empty_permitted_features_uses_role():
    """Empty permitted_features list = no explicit allowlist → use role defaults."""
    brand = make_brand(permitted_features=frozenset())
    perms = _resolve_permissions(brand, "editor")

    # No brand allowlist → editor gets full role defaults
    assert perms == ROLE_PERMISSIONS["editor"]


def test_resolve_permissions_brand_admin_role():
    """brand_admin role gets brand:admin permissions when brand permits."""
    brand = make_brand(
        permitted_features=frozenset({
            "data:read", "data:export", "data:pii", "survey:write",
            "workflow:write", "brand:admin", "brand:signals", "brand:quality",
        }),
    )
    perms = _resolve_permissions(brand, "brand_admin")

    assert "brand:admin" in perms
    assert "brand:signals" in perms
    assert "brand:quality" in perms


# ── ROLE_PERMISSIONS tests ────────────────────────────────────────────────────

def test_role_permissions_hierarchy():
    """admin permissions should be a superset of editor which is superset of viewer."""
    viewer = ROLE_PERMISSIONS["viewer"]
    editor = ROLE_PERMISSIONS["editor"]
    admin = ROLE_PERMISSIONS["admin"]
    brand_admin = ROLE_PERMISSIONS["brand_admin"]

    # viewer ⊆ editor ⊆ admin ⊆ brand_admin
    assert viewer.issubset(editor)
    assert editor.issubset(admin)
    assert admin.issubset(brand_admin)


def test_role_permissions_pii_only_admin():
    """data:pii should only be available to admin and brand_admin roles."""
    assert "data:pii" not in ROLE_PERMISSIONS["viewer"]
    assert "data:pii" not in ROLE_PERMISSIONS["editor"]
    assert "data:pii" in ROLE_PERMISSIONS["admin"]
    assert "data:pii" in ROLE_PERMISSIONS["brand_admin"]


# ── CrystalContext tests ───────────────────────────────────────────────────────

def test_crystal_context_with_brand():
    """CrystalContext accepts brand and user_role fields."""
    brand = make_brand()
    perms = _resolve_permissions(brand, "admin")

    ctx = CrystalContext(
        org_id="org-123",
        user_id="user-456",
        survey_id="survey-789",
        scope="survey",
        brand=brand,
        user_role="admin",
        effective_perms=perms,
    )

    assert ctx.brand is brand
    assert ctx.user_role == "admin"
    assert "data:read" in ctx.effective_perms
    assert ctx.brand.brand_name == "Marriott"


def test_crystal_context_backward_compat():
    """CrystalContext works without brand arg (old-style instantiation)."""
    ctx = CrystalContext(
        org_id="org-123",
        user_id="user-456",
        survey_id="survey-789",
        scope="survey",
    )

    assert ctx.brand is None
    assert ctx.user_role == "viewer"
    assert ctx.effective_perms == frozenset()


def test_crystal_context_without_brand_fields_preserved():
    """Existing fields still work after adding brand/role."""
    ctx = CrystalContext(
        org_id="org-abc",
        user_id="user-xyz",
        survey_id=None,
        scope="org",
        run_id="run-999",
        has_open_text=False,
        tag_ids=("tag1", "tag2"),
    )

    assert ctx.org_id == "org-abc"
    assert ctx.run_id == "run-999"
    assert ctx.has_open_text is False
    assert ctx.tag_ids == ("tag1", "tag2")
    assert ctx.survey_id is None


def test_crystal_context_is_frozen():
    """CrystalContext is immutable (frozen dataclass)."""
    ctx = CrystalContext(
        org_id="org-123",
        user_id="user-456",
        survey_id="survey-789",
        scope="survey",
    )
    with pytest.raises((AttributeError, TypeError)):
        ctx.org_id = "modified"  # type: ignore[misc]
