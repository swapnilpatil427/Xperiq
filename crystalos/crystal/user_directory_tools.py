"""Crystal user-directory tools — segment users by department/group/role for
comparative analysis.

These query Postgres directly (same pattern as crystal/tools.py). NOTE: the design
doc proposed having Crystal call "internal backend routes" for this, but CrystalOS
has no callback channel into the Node backend (Node → agents only), and every other
Crystal tool reads Postgres directly — so these do the same.

Every executor:
- Enforces org_id scoping on ALL queries (tenant isolation)
- Uses parameterized queries only (%s placeholders, psycopg)
- Returns {"error": "..."} on failure rather than raising
"""
from __future__ import annotations

import traceback
from typing import Any

from crystalos.crystal.context import CrystalContext
from crystalos.lib import db
from crystalos.lib.logger import logger


def _rows(cur, results) -> list[dict[str, Any]]:
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in results]


async def execute_get_user_directory_context(ctx: CrystalContext, params: dict) -> dict:
    """Return the org's department tree, user groups, and active-user count so
    Crystal can reason about how to segment respondents."""
    try:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT d.id, d.name, d.parent_department_id, d.depth, d.path,
                              COUNT(up.user_id) FILTER (
                                WHERE up.is_active AND up.deprovisioned_at IS NULL
                              )::int AS member_count
                       FROM departments d
                       LEFT JOIN user_profiles up
                              ON up.department_id = d.id AND up.org_id = %s
                       WHERE d.org_id = %s AND d.is_active = TRUE
                       GROUP BY d.id
                       ORDER BY d.depth, d.name""",
                    (ctx.org_id, ctx.org_id),
                )
                departments = _rows(cur, await cur.fetchall())

                await cur.execute(
                    """SELECT id, name, group_type, member_count
                       FROM user_groups
                       WHERE org_id = %s AND is_active = TRUE
                       ORDER BY name""",
                    (ctx.org_id,),
                )
                groups = _rows(cur, await cur.fetchall())

                await cur.execute(
                    """SELECT COUNT(*)::int AS n FROM user_profiles
                       WHERE org_id = %s AND is_active = TRUE AND deprovisioned_at IS NULL""",
                    (ctx.org_id,),
                )
                total = (await cur.fetchone())[0]

        return {
            "departments": [
                {"id": str(d["id"]), "name": d["name"],
                 "parent_id": str(d["parent_department_id"]) if d["parent_department_id"] else None,
                 "depth": d["depth"], "member_count": d["member_count"]}
                for d in departments
            ],
            "groups": [
                {"id": str(g["id"]), "name": g["name"],
                 "type": g["group_type"], "member_count": g["member_count"]}
                for g in groups
            ],
            "total_active_users": total,
        }
    except Exception as exc:
        logger.error("tool_get_user_directory_context_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_segment_users_by_attribute(ctx: CrystalContext, params: dict) -> dict:
    """Resolve a segment definition to a list of user_ids (for cross-referencing
    responses by respondent). Accepts one of: department_id / department_name (incl.
    all sub-departments), group_id / group_name, or role_key."""
    try:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                dept_id = params.get("department_id")
                group_id = params.get("group_id")
                user_ids: list[str] = []
                resolved: dict[str, Any] = {}

                # Resolve a department name → id.
                if not dept_id and params.get("department_name"):
                    await cur.execute(
                        "SELECT id FROM departments WHERE org_id = %s AND name = %s AND is_active = TRUE LIMIT 1",
                        (ctx.org_id, params["department_name"]),
                    )
                    r = await cur.fetchone()
                    dept_id = str(r[0]) if r else None

                # Resolve a group name → id.
                if not group_id and params.get("group_name"):
                    await cur.execute(
                        "SELECT id FROM user_groups WHERE org_id = %s AND name = %s AND is_active = TRUE LIMIT 1",
                        (ctx.org_id, params["group_name"]),
                    )
                    r = await cur.fetchone()
                    group_id = str(r[0]) if r else None

                if dept_id:
                    # Include the department AND all descendants (path @> [dept_id]).
                    await cur.execute(
                        """SELECT up.user_id FROM user_profiles up
                           WHERE up.org_id = %s AND up.is_active = TRUE AND up.deprovisioned_at IS NULL
                             AND up.department_id IN (
                               SELECT id FROM departments
                               WHERE org_id = %s AND path @> ARRAY[%s]::text[]
                             )""",
                        (ctx.org_id, ctx.org_id, dept_id),
                    )
                    user_ids = [r[0] for r in await cur.fetchall()]
                    resolved = {"segment_type": "department", "department_id": dept_id}
                elif group_id:
                    await cur.execute(
                        """SELECT ugm.user_id FROM user_group_members ugm
                           JOIN user_profiles up ON up.user_id = ugm.user_id AND up.org_id = ugm.org_id
                           WHERE ugm.group_id = %s AND ugm.org_id = %s
                             AND up.is_active = TRUE AND up.deprovisioned_at IS NULL""",
                        (group_id, ctx.org_id),
                    )
                    user_ids = [r[0] for r in await cur.fetchall()]
                    resolved = {"segment_type": "group", "group_id": group_id}
                elif params.get("role_key"):
                    await cur.execute(
                        """SELECT up.user_id FROM user_profiles up
                           JOIN org_roles r ON r.id = up.role_id
                           WHERE up.org_id = %s AND r.builtin_key = %s
                             AND up.is_active = TRUE AND up.deprovisioned_at IS NULL""",
                        (ctx.org_id, params["role_key"]),
                    )
                    user_ids = [r[0] for r in await cur.fetchall()]
                    resolved = {"segment_type": "role", "role_key": params["role_key"]}
                else:
                    return {"error": "Provide one of department_id/department_name, group_id/group_name, or role_key"}

        return {**resolved, "user_ids": user_ids, "count": len(user_ids)}
    except Exception as exc:
        logger.error("tool_segment_users_by_attribute_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


USER_DIRECTORY_EXECUTORS = {
    "get_user_directory_context": execute_get_user_directory_context,
    "segment_users_by_attribute": execute_segment_users_by_attribute,
}

USER_DIRECTORY_TOOL_DEFS = [
    {
        "name": "get_user_directory_context",
        "description": (
            "Get the org's department hierarchy, user groups, and active-user count. "
            "Use this to discover how the organization is structured before segmenting "
            "responses (e.g. 'How does Engineering compare to Sales?')."
        ),
        "scope": "org",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "segment_users_by_attribute",
        "description": (
            "Resolve a segment (a department and its sub-departments, a user group, or a "
            "role) to the list of user_ids in it. Use the returned user_ids to cross-reference "
            "responses by respondent for comparative analysis across org segments."
        ),
        "scope": "org",
        "input_schema": {
            "type": "object",
            "properties": {
                "department_id": {"type": "string", "description": "Department UUID (includes sub-departments)"},
                "department_name": {"type": "string", "description": "Department name (resolved to id)"},
                "group_id": {"type": "string", "description": "User group UUID"},
                "group_name": {"type": "string", "description": "User group name (resolved to id)"},
                "role_key": {"type": "string", "description": "Built-in role key, e.g. org:analyst"},
            },
        },
    },
]
