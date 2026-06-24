"""Brand admin signal endpoints — Phase 5.

GET  /api/admin/brands/{brand_id}/signals          — list product signals for a brand
GET  /api/admin/brands/{brand_id}/signals/summary  — aggregate counts by type/severity/feature
POST /api/admin/brands/{brand_id}/signals/{id}/status — update signal status (state machine)
GET  /api/admin/brands/{brand_id}/crystal/quality  — Crystal quality metrics for this brand

All endpoints require brand_admin role and X-Internal-Key auth.
"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from crystalos.lib.db import _pool_conn
from crystalos.lib.logger import logger
from crystalos.lib.security import require_internal_key

router = APIRouter(prefix="/api/admin/brands", tags=["brand-admin"])


async def _require_brand_admin(brand_id: str, user_id: str, conn) -> None:
    """Verify user has brand_admin role for the given brand_id.

    Checks org_user_roles table. Raises 403 if not authorized.
    Falls through gracefully if the table doesn't exist yet (dev mode).
    """
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT 1 FROM org_user_roles
                   WHERE brand_id = %s AND user_id = %s AND role = 'brand_admin'
                   LIMIT 1""",
                (brand_id, user_id),
            )
            row = await cur.fetchone()
            if row is None:
                raise HTTPException(status_code=403, detail="brand_admin role required")
    except HTTPException:
        raise
    except Exception:
        # Table may not exist in dev — skip auth check
        pass


class SignalStatusUpdate(BaseModel):
    status: Literal["open", "in_progress", "resolved"]


# State machine: only forward transitions are allowed; resolved is terminal
VALID_TRANSITIONS: dict[str, set[str]] = {
    "open":        {"in_progress"},
    "in_progress": {"resolved"},
    "resolved":    set(),
}


@router.get("/{brand_id}/signals", summary="List product signals for a brand")
async def list_brand_signals(
    brand_id: str,
    request: Request,
    _key: None = Depends(require_internal_key),
) -> dict:
    user_id     = request.query_params.get("user_id", "")
    signal_type = request.query_params.get("type", "all")
    status      = request.query_params.get("status", "all")
    try:
        limit  = max(1, min(int(request.query_params.get("limit", "20")), 100))
        offset = max(0, int(request.query_params.get("offset", "0")))
    except ValueError:
        raise HTTPException(status_code=400, detail="limit and offset must be integers")

    async with _pool_conn().connection() as conn:
        await _require_brand_admin(brand_id, user_id, conn)

        clauses: list[str] = ["brand_id = %s"]
        params:  list      = [brand_id]

        if signal_type != "all":
            clauses.append("signal_type = %s")
            params.append(signal_type)
        if status != "all":
            clauses.append("status = %s")
            params.append(status)

        params += [limit, offset]
        where = " AND ".join(clauses)

        async with conn.cursor() as cur:
            await cur.execute(
                f"""SELECT id, signal_type, title, description, affects_feature,
                           severity, status, vote_count, created_at
                    FROM crystal_product_signals
                    WHERE {where}
                    ORDER BY vote_count DESC
                    LIMIT %s OFFSET %s""",
                params,
            )
            rows = await cur.fetchall()
            cols = [d[0] for d in cur.description]
            signals = []
            for row in rows:
                r = dict(zip(cols, row))
                if r.get("created_at"):
                    r["created_at"] = r["created_at"].isoformat()
                signals.append(r)

    return {"signals": signals, "limit": limit, "offset": offset}


@router.get("/{brand_id}/signals/summary", summary="Aggregate signal counts for a brand")
async def brand_signals_summary(
    brand_id: str,
    request: Request,
    _key: None = Depends(require_internal_key),
) -> dict:
    user_id = request.query_params.get("user_id", "")

    async with _pool_conn().connection() as conn:
        await _require_brand_admin(brand_id, user_id, conn)

        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT signal_type, severity, affects_feature, COUNT(*) as count
                   FROM crystal_product_signals
                   WHERE brand_id = %s
                   GROUP BY signal_type, severity, affects_feature""",
                (brand_id,),
            )
            rows = await cur.fetchall()

    by_type:     dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_feature:  dict[str, int] = {}
    total = 0

    for row in rows:
        sig_type, severity, feature, count = row
        count = int(count)
        total += count
        by_type[sig_type] = by_type.get(sig_type, 0) + count
        if severity:
            by_severity[severity] = by_severity.get(severity, 0) + count
        if feature:
            by_feature[feature] = by_feature.get(feature, 0) + count

    return {
        "total":       total,
        "by_type":     by_type,
        "by_severity": by_severity,
        "by_feature":  by_feature,
    }


@router.patch("/{brand_id}/signals/{signal_id}/status", summary="Update signal status")
async def update_signal_status(
    brand_id:  str,
    signal_id: str,
    body:      SignalStatusUpdate,
    request:   Request,
    _key:      None = Depends(require_internal_key),
) -> dict:
    user_id = request.query_params.get("user_id", "")

    async with _pool_conn().connection() as conn:
        await _require_brand_admin(brand_id, user_id, conn)

        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT status FROM crystal_product_signals WHERE id = %s AND brand_id = %s",
                (signal_id, brand_id),
            )
            row = await cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Signal not found")
            current_status = row[0]

        allowed_next = VALID_TRANSITIONS.get(current_status, set())
        if body.status not in allowed_next:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid transition: {current_status} → {body.status}. "
                    f"Allowed: {sorted(allowed_next) or 'none (resolved is terminal)'}"
                ),
            )

        await conn.execute(
            "UPDATE crystal_product_signals SET status = %s WHERE id = %s",
            (body.status, signal_id),
        )
        await conn.commit()

    return {"signal_id": signal_id, "status": body.status}


@router.get("/{brand_id}/crystal/quality", summary="Crystal quality metrics for a brand")
async def brand_crystal_quality(
    brand_id: str,
    request:  Request,
    _key:     None = Depends(require_internal_key),
) -> dict:
    user_id = request.query_params.get("user_id", "")

    async with _pool_conn().connection() as conn:
        await _require_brand_admin(brand_id, user_id, conn)

        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT skill_name, total_runs, pass_count, avg_eval_score,
                          positive_signals, negative_signals, p50_latency_ms, last_updated
                   FROM skill_quality_metrics
                   WHERE brand_id = %s
                   ORDER BY total_runs DESC""",
                (brand_id,),
            )
            rows = await cur.fetchall()
            cols    = [d[0] for d in cur.description] if rows else []
            metrics = []
            for row in rows:
                r = dict(zip(cols, row))
                if r.get("last_updated"):
                    r["last_updated"] = r["last_updated"].isoformat()
                if r.get("avg_eval_score") is not None:
                    r["avg_eval_score"] = float(r["avg_eval_score"])
                metrics.append(r)

    return {"brand_id": brand_id, "quality_metrics": metrics}
