"""Crystal feedback endpoint — Phase 5.

POST /api/crystal/feedback
  Submit thumbs up/down on a Crystal response.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from crystalos.lib.db import _pool_conn
from crystalos.lib.logger import logger
from crystalos.lib.security import require_internal_key

router = APIRouter(prefix="/api/crystal", tags=["crystal-feedback"])


class CrystalFeedbackRequest(BaseModel):
    turn_event_id: str
    org_id: str
    brand_id: str | None = None
    user_id: str
    signal: int
    reason_code: str | None = None
    comment: str | None = None

    @field_validator("signal")
    @classmethod
    def validate_signal(cls, v: int) -> int:
        if v not in (-1, 1):
            raise ValueError("signal must be -1 or 1")
        return v


async def _flag_quality_regression(org_id: str, brand_id: str | None, conn) -> None:
    """Log a quality regression warning and insert a notification event."""
    logger.warning(
        "quality_regression_flagged",
        org_id=org_id,
        brand_id=brand_id,
        note="3+ negative signals in last 7 days",
    )
    try:
        await conn.execute(
            """INSERT INTO notification_events (type, payload, created_at)
               VALUES (%s, %s::jsonb, NOW())""",
            (
                "quality_regression",
                json.dumps({"org_id": org_id, "brand_id": brand_id}),
            ),
        )
    except Exception as exc:
        logger.warning("quality_regression_notify_failed", error=str(exc))


@router.post("/feedback", summary="Submit thumbs up/down on a Crystal response")
async def submit_crystal_feedback(
    body: CrystalFeedbackRequest,
    _key: None = Depends(require_internal_key),
) -> dict:
    async with _pool_conn().connection() as conn:
        await conn.execute(
            """INSERT INTO crystal_feedback
               (turn_event_id, org_id, brand_id, user_id, signal, reason_code, comment)
               VALUES (%s::uuid, %s, %s, %s, %s, %s, %s)""",
            (
                body.turn_event_id,
                body.org_id,
                body.brand_id,
                body.user_id,
                body.signal,
                body.reason_code,
                body.comment,
            ),
        )

        # Check for 3+ negative signals in last 7 days from this org
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT COUNT(*) FROM crystal_feedback
                   WHERE org_id = %s
                     AND signal = -1
                     AND created_at > NOW() - INTERVAL '7 days'""",
                (body.org_id,),
            )
            row = await cur.fetchone()
            negative_count = int(row[0]) if row else 0

        if negative_count >= 3:
            await _flag_quality_regression(body.org_id, body.brand_id, conn)

        await conn.commit()

    logger.info(
        "crystal_feedback_recorded",
        org_id=body.org_id,
        signal=body.signal,
        turn_event_id=body.turn_event_id,
    )
    return {"status": "recorded"}
