"""Detect and route product feedback signals from Crystal conversations.

Phase 4/5/6: FeedbackDetector — captures feature requests and bug reports
from Crystal conversation turns and persists them with semantic dedup.

Task 6.4: persist_signal now also creates bug_report rows for bug signals
and handles duplicate-org recording for known bugs.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING

from crystalos.lib.logger import logger
from crystalos.lib.db import _pool_conn

if TYPE_CHECKING:
    from crystalos.crystal.context import CrystalContext


# ── Signal dataclass ─────────────────────────────────────────────────────────────

@dataclass
class ProductSignal:
    signal_type:     str           # feature_request | bug | complaint | praise
    title:           str
    description:     str
    affects_feature: str | None
    severity:        str           # low | medium | high | critical
    routing:         str           # platform | brand
    brand_ticket_url: str | None
    raw_query:       str


# ── Fast pattern matching ─────────────────────────────────────────────────────────

_FEATURE_PATTERNS = [
    "wish", "would be great", "can you add", "feature request",
    "need the ability", "it would be nice", "please add", "missing",
    "doesn't support", "can't do",
]
_BUG_PATTERNS = [
    "bug", "broken", "not working", "error", "crash",
    "wrong data", "incorrect data", "showing wrong",
]


def _quick_classify(query: str) -> str | None:
    q = query.lower()
    if any(p in q for p in _BUG_PATTERNS):
        return "bug"
    if any(p in q for p in _FEATURE_PATTERNS):
        return "feature_request"
    return None


def _determine_routing(signal_type: str, ctx: "CrystalContext") -> str:
    """Brand bugs go to brand's own system; everything else goes to platform tracking."""
    if not ctx.brand:
        return "platform"
    if ctx.brand.support_ticket_url and signal_type == "bug":  # type: ignore[union-attr]
        return "brand"
    return "platform"


# ── Detection ────────────────────────────────────────────────────────────────────

async def _llm_extract_signal(signal_type: str, query: str) -> dict:
    """Call LLM to extract structured signal fields. Returns dict with title/description/etc."""
    from crystalos.lib.openrouter import _call_with_backoff
    from crystalos.lib.models import ModelConfig
    config = ModelConfig(model="openai/gpt-4o-mini", temperature=0.0, max_tokens=200)
    prompt = (
        f'Extract a structured {signal_type} from:\n\n"{query}"\n\n'
        'JSON only:\n'
        '{"title": "...", "description": "...", "affects_feature": "...", '
        '"severity": "low|medium|high|critical"}'
    )
    content, _ = await _call_with_backoff(
        messages=[{"role": "user", "content": prompt}],
        config=config,
    )
    return json.loads(content.strip())


async def detect_and_route_signal(
    query: str,
    ctx: "CrystalContext",
) -> ProductSignal | None:
    """Detect a product signal from a Crystal conversation query.

    Uses fast pattern matching to avoid unnecessary LLM calls on non-signal queries.
    When a signal is detected, extracts structured fields via LLM.
    Returns None if no signal detected.
    """
    signal_type = _quick_classify(query)
    if not signal_type:
        return None

    try:
        data = await _llm_extract_signal(signal_type, query)
    except Exception as exc:
        logger.warning("feedback_detector_extraction_failed", error=str(exc))
        return None

    routing = _determine_routing(signal_type, ctx)
    brand_ticket_url = None
    if ctx.brand and routing == "brand":
        brand_ticket_url = getattr(ctx.brand, "support_ticket_url", None)  # type: ignore[union-attr]

    return ProductSignal(
        signal_type=signal_type,
        title=data.get("title", query[:100]),
        description=data.get("description", query),
        affects_feature=data.get("affects_feature"),
        severity=data.get("severity", "medium"),
        routing=routing,
        brand_ticket_url=brand_ticket_url,
        raw_query=query,
    )


# ── Persistence ───────────────────────────────────────────────────────────────────

async def persist_signal(signal: ProductSignal, ctx: "CrystalContext") -> None:
    """Write signal to DB with semantic dedup.

    For feature_request signals: increments vote_count on duplicates.
    For bug signals: creates a bug_report row, or records a new affected org for known bugs.
    """
    try:
        await _persist_signal_inner(signal, ctx)
    except Exception as exc:
        logger.warning("persist_signal_failed", error=str(exc))


async def _persist_signal_inner(signal: ProductSignal, ctx: "CrystalContext") -> None:
    sig_hash = hashlib.sha256(
        f"{signal.title}:{signal.affects_feature}".encode()
    ).hexdigest()[:16]

    brand_id = ctx.brand.brand_id if ctx.brand else None  # type: ignore[union-attr]

    async with _pool_conn().connection() as conn:
        # Check for existing open signal with the same semantic hash
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT id, signal_type FROM crystal_product_signals
                   WHERE semantic_hash = %s AND status = 'open'
                   LIMIT 1""",
                (sig_hash,),
            )
            existing_row = await cur.fetchone()

        if existing_row:
            existing_id, existing_type = existing_row

            if signal.signal_type == "feature_request":
                # Feature request dedup: increment vote count
                await conn.execute(
                    "UPDATE crystal_product_signals SET vote_count = vote_count + 1 WHERE id = %s",
                    (str(existing_id),),
                )
                logger.info(
                    "feature_request_vote_incremented",
                    signal_id=str(existing_id),
                    title=signal.title,
                )

            elif signal.signal_type == "bug":
                # Bug dedup: record this org as additionally affected
                # Look up the bug_report linked to this product signal
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT id FROM bug_reports WHERE signal_id = %s LIMIT 1",
                        (str(existing_id),),
                    )
                    bug_row = await cur.fetchone()

                if bug_row:
                    from crystalos.lib.bug_tracker import record_additional_affected_org
                    await record_additional_affected_org(str(bug_row[0]), ctx, conn)
                    logger.info(
                        "bug_additional_org_recorded",
                        bug_id=str(bug_row[0]),
                        org_id=ctx.org_id,
                    )

            await conn.commit()
            return

        # New signal — insert into crystal_product_signals
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO crystal_product_signals
                   (signal_type, org_id, brand_id, user_id, survey_id,
                    title, description, affects_feature, severity, routing,
                    brand_ticket_url, semantic_hash, raw_query)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    signal.signal_type,
                    ctx.org_id,
                    brand_id,
                    ctx.user_id,
                    ctx.survey_id,
                    signal.title,
                    signal.description,
                    signal.affects_feature,
                    signal.severity,
                    signal.routing,
                    signal.brand_ticket_url,
                    sig_hash,
                    signal.raw_query,
                ),
            )
            new_row = await cur.fetchone()

        new_signal_id = str(new_row[0]) if new_row else None

        # For bug signals, also create a bug_report row
        if signal.signal_type == "bug" and new_signal_id:
            try:
                from crystalos.lib.bug_tracker import create_bug_report
                bug_id = await create_bug_report(signal, ctx, conn)
                # Link the product signal to the bug report
                await conn.execute(
                    "UPDATE bug_reports SET signal_id = %s WHERE id = %s",
                    (new_signal_id, bug_id),
                )
                logger.info(
                    "bug_report_created_from_signal",
                    signal_id=new_signal_id,
                    bug_id=bug_id,
                )
            except Exception as exc:
                logger.warning("bug_report_creation_failed", error=str(exc))

        await conn.commit()
        logger.info(
            "product_signal_persisted",
            signal_type=signal.signal_type,
            title=signal.title,
            org_id=ctx.org_id,
        )
