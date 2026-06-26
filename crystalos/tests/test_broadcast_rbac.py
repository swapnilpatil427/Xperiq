"""Tests for the RBAC permission model in crystal/context.py.

These tests are based on the ACTUAL values in ROLE_PERMISSIONS — read from the
source before writing assertions. No invented role or permission names.

Roles defined: viewer, editor, admin, brand_admin
Permissions defined: data:read, data:export, data:pii, survey:write,
                     workflow:write, admin:read, brand:admin
"""
from __future__ import annotations

import pytest


# ── ROLE_PERMISSIONS correctness ─────────────────────────────────────────────

class TestRolePermissions:
    def test_viewer_has_only_data_read(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert ROLE_PERMISSIONS["viewer"] == frozenset({"data:read"})

    def test_editor_has_data_read_export_survey_write_workflow_write(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "data:read" in ROLE_PERMISSIONS["editor"]
        assert "data:export" in ROLE_PERMISSIONS["editor"]
        assert "survey:write" in ROLE_PERMISSIONS["editor"]
        assert "workflow:write" in ROLE_PERMISSIONS["editor"]

    def test_editor_does_not_have_data_pii(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "data:pii" not in ROLE_PERMISSIONS["editor"]

    def test_editor_does_not_have_admin_read(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "admin:read" not in ROLE_PERMISSIONS["editor"]

    def test_admin_has_data_pii(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "data:pii" in ROLE_PERMISSIONS["admin"]

    def test_admin_has_admin_read(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "admin:read" in ROLE_PERMISSIONS["admin"]

    def test_admin_does_not_have_brand_admin(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "brand:admin" not in ROLE_PERMISSIONS["admin"]

    def test_brand_admin_has_all_admin_permissions(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        for perm in ("data:read", "data:export", "data:pii", "survey:write",
                     "workflow:write", "admin:read", "brand:admin"):
            assert perm in ROLE_PERMISSIONS["brand_admin"], f"brand_admin missing {perm}"

    def test_viewer_does_not_have_survey_write(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "survey:write" not in ROLE_PERMISSIONS["viewer"]

    def test_all_roles_have_data_read(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        for role in ("viewer", "editor", "admin", "brand_admin"):
            assert "data:read" in ROLE_PERMISSIONS[role], f"{role} missing data:read"

    def test_data_pii_only_granted_to_admin_and_brand_admin(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS

        assert "data:pii" not in ROLE_PERMISSIONS["viewer"]
        assert "data:pii" not in ROLE_PERMISSIONS["editor"]
        assert "data:pii" in ROLE_PERMISSIONS["admin"]
        assert "data:pii" in ROLE_PERMISSIONS["brand_admin"]


# ── _resolve_permissions tests ───────────────────────────────────────────────

class TestResolvePermissions:
    def _make_brand(self, permitted=frozenset(), restricted=frozenset()):
        from crystalos.crystal.context import BrandContext
        return BrandContext(
            brand_id="brand-1",
            brand_name="Test Brand",
            brand_persona=None,
            data_region="us",
            plan_tier="enterprise",
            permitted_features=frozenset(permitted),
            restricted_features=frozenset(restricted),
            custom_instructions=None,
            support_ticket_url=None,
            feature_request_url=None,
        )

    def test_returns_role_defaults_when_no_brand(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS, _resolve_permissions

        perms = _resolve_permissions(None, "admin")
        assert perms == ROLE_PERMISSIONS["admin"]

    def test_returns_intersection_with_brand_permitted_features_for_non_brand_admin(self):
        from crystalos.crystal.context import _resolve_permissions

        # Brand only permits data:read — editor normally also has survey:write
        brand = self._make_brand(permitted={"data:read"})
        perms = _resolve_permissions(brand, "editor")
        assert "data:read" in perms
        assert "survey:write" not in perms

    def test_returns_empty_when_brand_permits_nothing_matching_role(self):
        from crystalos.crystal.context import _resolve_permissions

        # Permitted features has no overlap with viewer (which only has data:read)
        brand = self._make_brand(permitted={"survey:write"})
        perms = _resolve_permissions(brand, "viewer")
        assert len(perms) == 0

    def test_restricted_features_removed_from_effective_perms(self):
        from crystalos.crystal.context import _resolve_permissions

        # Admin has data:pii normally; brand restricts it
        brand = self._make_brand(restricted={"data:pii"})
        perms = _resolve_permissions(brand, "admin")
        assert "data:pii" not in perms

    def test_brand_admin_gets_role_defaults_plus_brand_permitted_features(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS, _resolve_permissions

        # Brand adds an extra custom feature
        brand = self._make_brand(permitted={"custom:feature"})
        perms = _resolve_permissions(brand, "brand_admin")
        # brand_admin gets union of role defaults + permitted_features
        assert "brand:admin" in perms  # from role defaults
        assert "custom:feature" in perms  # from brand

    def test_brand_admin_restricted_features_still_removed(self):
        from crystalos.crystal.context import _resolve_permissions

        brand = self._make_brand(permitted=frozenset(), restricted={"brand:admin"})
        perms = _resolve_permissions(brand, "brand_admin")
        assert "brand:admin" not in perms

    def test_unknown_role_returns_empty_frozenset(self):
        from crystalos.crystal.context import _resolve_permissions

        perms = _resolve_permissions(None, "nonexistent_role")
        assert perms == frozenset()

    def test_empty_brand_permitted_features_means_no_intersection(self):
        from crystalos.crystal.context import ROLE_PERMISSIONS, _resolve_permissions

        # When permitted_features is empty frozenset, no intersection is applied
        brand = self._make_brand(permitted=frozenset())
        perms = _resolve_permissions(brand, "editor")
        # Should equal role defaults (no intersection when permitted_features empty)
        assert perms == ROLE_PERMISSIONS["editor"]


# ── BrandContext.permitted_features behavior ──────────────────────────────────

class TestBrandContextPermittedFeatures:
    def _make_brand(self, permitted=frozenset(), restricted=frozenset()):
        from crystalos.crystal.context import BrandContext
        return BrandContext(
            brand_id="brand-1",
            brand_name="Test Brand",
            brand_persona=None,
            data_region="us",
            plan_tier="enterprise",
            permitted_features=frozenset(permitted),
            restricted_features=frozenset(restricted),
            custom_instructions=None,
            support_ticket_url=None,
            feature_request_url=None,
        )

    def test_permitted_features_is_accessible_as_frozenset(self):
        brand = self._make_brand(permitted={"feature_a", "feature_b"})
        assert isinstance(brand.permitted_features, frozenset)
        assert "feature_a" in brand.permitted_features

    def test_restricted_features_is_accessible_as_frozenset(self):
        brand = self._make_brand(restricted={"feature_c"})
        assert isinstance(brand.restricted_features, frozenset)
        assert "feature_c" in brand.restricted_features

    def test_brand_with_outreach_permitted_feature_grants_it_to_admin(self):
        """When 'outreach' is in permitted_features, brand_admin can access it."""
        from crystalos.crystal.context import _resolve_permissions

        brand = self._make_brand(permitted={"outreach", "data:read", "data:export",
                                            "data:pii", "survey:write", "workflow:write",
                                            "admin:read", "brand:admin"})
        perms = _resolve_permissions(brand, "brand_admin")
        assert "outreach" in perms

    def test_brand_without_outreach_in_permitted_does_not_grant_outreach(self):
        """When 'outreach' is NOT in permitted_features, even brand_admin won't have it."""
        from crystalos.crystal.context import _resolve_permissions

        # permitted_features is empty → role defaults used, but 'outreach' not in role defaults
        brand = self._make_brand(permitted=frozenset())
        perms = _resolve_permissions(brand, "brand_admin")
        assert "outreach" not in perms

    def test_brand_context_is_immutable_frozen_dataclass(self):
        brand = self._make_brand(permitted={"feature_x"})
        with pytest.raises((AttributeError, TypeError)):
            brand.brand_name = "Modified"  # type: ignore
