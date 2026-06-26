"""Support intent classifier — fast keyword-based pre-turn classifier.

Runs before the main Crystal skill call to detect support intent without an LLM call.
Keeps latency low by using keyword scoring instead of an LLM for the routing decision.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class SupportIntent(str, Enum):
    HOW_TO = "how_to"
    BUG_REPORT = "bug_report"
    BILLING = "billing"
    FEATURE_REQUEST = "feature_request"
    ACCOUNT_ISSUE = "account_issue"
    API_HELP = "api_help"
    DATA_QUESTION = "data_question"
    ESCALATE = "escalate"
    GENERAL = "general"  # Not support-specific — route to standard Crystal


class ClassificationResult(BaseModel):
    is_support: bool
    intent: Optional[SupportIntent]
    confidence: float  # 0.0–1.0
    should_activate_support_mode: bool  # True if is_support and confidence > 0.55


# ── Keyword tables ────────────────────────────────────────────────────────────

# Multi-word phrases are matched first (higher precision).
# Single-word keywords are matched against word boundaries only.

SUPPORT_KEYWORDS: dict[SupportIntent, list[str]] = {
    SupportIntent.BUG_REPORT: [
        "not working",
        "isn't working",
        "doesn't work",
        "broken",
        "error",
        "bug",
        "crash",
        "crashed",
        "failed",
        "failing",
        "404",
        "500",
        "502",
        "503",
        "issue",
        "problem",
        "glitch",
        "unexpected",
        "wrong result",
        "wrong data",
        "missing data",
        "not loading",
        "won't load",
        "loading forever",
        "spinner",
        "hangs",
        "timeout",
    ],
    SupportIntent.HOW_TO: [
        "how do i",
        "how to",
        "how can i",
        "steps to",
        "guide",
        "tutorial",
        "help me",
        "show me",
        "walk me through",
        "what's the best way",
        "what is the best way",
        "is it possible to",
        "can i",
        "where do i",
        "how does",
    ],
    SupportIntent.BILLING: [
        "credit",
        "credits",
        "billing",
        "payment",
        "invoice",
        "subscription",
        "price",
        "pricing",
        "cost",
        "charged",
        "charge",
        "refund",
        "plan",
        "upgrade",
        "downgrade",
        "tier",
        "receipt",
        "overcharged",
        "double charged",
        "ran out",
        "quota",
    ],
    SupportIntent.ACCOUNT_ISSUE: [
        "can't login",
        "cannot login",
        "can't log in",
        "cannot log in",
        "can't access",
        "cannot access",
        "permission",
        "permissions",
        "role",
        "roles",
        "org",
        "provisioning",
        "invite",
        "invited",
        "sso",
        "saml",
        "two-factor",
        "2fa",
        "locked out",
        "account",
        "no access",
        "lost access",
        "don't have access",
    ],
    SupportIntent.API_HELP: [
        "api",
        "webhook",
        "webhooks",
        "sdk",
        "endpoint",
        "endpoints",
        "integration",
        "curl",
        "token",
        "api key",
        "api token",
        "rest",
        "http",
        "request",
        "response body",
        "json payload",
        "hmac",
        "signature",
        "401",
        "403",
        "authentication",
        "rate limit",
    ],
    SupportIntent.ESCALATE: [
        "human",
        "agent",
        "support ticket",
        "speak to",
        "talk to",
        "real person",
        "escalate",
        "supervisor",
        "manager",
        "engineer",
        "someone",
        "a person",
        "i need help",
        "frustrated",
        "still not working",
        "gave up",
        "urgent",
        "asap",
        "immediately",
    ],
    SupportIntent.FEATURE_REQUEST: [
        "feature request",
        "wish you could",
        "would be nice",
        "could you add",
        "please add",
        "i'd love",
        "i would love",
        "suggestion",
        "roadmap",
        "planned",
        "will you",
        "are you planning",
        "future",
        "upcoming",
    ],
    SupportIntent.DATA_QUESTION: [
        "nps score",
        "csat score",
        "response count",
        "why is my",
        "why are my",
        "my data",
        "data looks wrong",
        "calculation",
        "how is nps calculated",
        "how is csat calculated",
        "methodology",
        "discrepancy",
        "different from",
        "last week",
        "last month",
        "changed",
        "dropped",
        "increased",
    ],
}

# Intent priority order — higher priority intents override lower ones when
# multiple intents tie on score. Escalate beats everything else.
_INTENT_PRIORITY: list[SupportIntent] = [
    SupportIntent.ESCALATE,
    SupportIntent.BUG_REPORT,
    SupportIntent.BILLING,
    SupportIntent.ACCOUNT_ISSUE,
    SupportIntent.API_HELP,
    SupportIntent.DATA_QUESTION,
    SupportIntent.HOW_TO,
    SupportIntent.FEATURE_REQUEST,
    SupportIntent.GENERAL,
]

# Intents that always activate support mode when detected above the threshold
_ALWAYS_SUPPORT_INTENTS: frozenset[SupportIntent] = frozenset({
    SupportIntent.BUG_REPORT,
    SupportIntent.BILLING,
    SupportIntent.ACCOUNT_ISSUE,
    SupportIntent.ESCALATE,
})

# Minimum word count for a message to be considered non-trivial
_MIN_WORD_COUNT = 2

# Confidence floor for activating support mode
_SUPPORT_ACTIVATION_THRESHOLD = 0.55


def _normalize(text: str) -> str:
    """Lowercase, collapse whitespace, remove punctuation noise."""
    text = text.lower().strip()
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Remove trailing punctuation that breaks phrase matching
    text = re.sub(r"[?.!]+$", "", text).strip()
    return text


def _score_intent(normalized_message: str, keywords: list[str]) -> float:
    """Score a single intent by keyword hit rate.

    Phrase keywords (multi-word) are worth more than single-word hits to
    reward precision. Returns a 0.0–1.0 score.
    """
    if not keywords:
        return 0.0

    total_weight = 0.0
    hit_weight = 0.0

    for kw in keywords:
        is_phrase = " " in kw
        weight = 2.0 if is_phrase else 1.0
        total_weight += weight

        if is_phrase:
            if kw in normalized_message:
                hit_weight += weight
        else:
            # Word-boundary match for single keywords
            pattern = r"\b" + re.escape(kw) + r"\b"
            if re.search(pattern, normalized_message):
                hit_weight += weight

    if total_weight == 0:
        return 0.0

    # Normalize to 0–1 and cap: max 5 keyword hits = 1.0 confidence
    raw_score = hit_weight / total_weight
    # Scale up small hit counts to give reasonable confidence values
    # 1 phrase match or 2 word matches → ~0.60+ confidence
    hit_count = sum(
        1 for kw in keywords
        if (" " in kw and kw in normalized_message)
        or (" " not in kw and re.search(r"\b" + re.escape(kw) + r"\b", normalized_message))
    )
    # Logistic-style scaling: first hit = 0.45, second = 0.65, third = 0.80, 4+ = 0.90+
    if hit_count == 0:
        return 0.0
    elif hit_count == 1:
        scaled = 0.45 + (0.20 * raw_score)
    elif hit_count == 2:
        scaled = 0.65 + (0.15 * raw_score)
    elif hit_count == 3:
        scaled = 0.80 + (0.10 * raw_score)
    else:
        scaled = 0.90 + (0.05 * raw_score)

    return min(1.0, round(scaled, 3))


async def classify_support_intent(message: str) -> ClassificationResult:
    """Fast keyword-based support intent classifier. No LLM call for latency.

    Args:
        message: The raw user message to classify.

    Returns:
        ClassificationResult with intent, confidence, and whether to activate
        support mode for this turn.
    """
    if not message or not isinstance(message, str):
        return ClassificationResult(
            is_support=False,
            intent=SupportIntent.GENERAL,
            confidence=0.0,
            should_activate_support_mode=False,
        )

    # Reject trivially short messages
    word_count = len(message.split())
    if word_count < _MIN_WORD_COUNT:
        return ClassificationResult(
            is_support=False,
            intent=SupportIntent.GENERAL,
            confidence=0.0,
            should_activate_support_mode=False,
        )

    normalized = _normalize(message)

    # Score each intent
    scores: dict[SupportIntent, float] = {}
    for intent, keywords in SUPPORT_KEYWORDS.items():
        scores[intent] = _score_intent(normalized, keywords)

    # Find the highest-scoring non-GENERAL intent
    best_intent: Optional[SupportIntent] = None
    best_score: float = 0.0

    for intent in _INTENT_PRIORITY:
        if intent == SupportIntent.GENERAL:
            continue
        score = scores.get(intent, 0.0)
        if score > best_score:
            best_score = score
            best_intent = intent
        elif score == best_score and best_intent is not None:
            # Priority order already handles ties — first in list wins
            pass

    # Determine if this is support-mode traffic
    is_support = best_score > 0.40 and best_intent is not None
    final_intent = best_intent if is_support else SupportIntent.GENERAL
    final_confidence = best_score if is_support else 0.0

    should_activate = (
        is_support
        and final_confidence > _SUPPORT_ACTIVATION_THRESHOLD
    )

    # Always-support intents (billing, bug, account, escalate) activate support mode
    # even at lower confidence if clearly signaled
    if best_intent in _ALWAYS_SUPPORT_INTENTS and best_score > 0.40:
        should_activate = True

    return ClassificationResult(
        is_support=is_support,
        intent=final_intent if is_support else None,
        confidence=round(final_confidence, 3),
        should_activate_support_mode=should_activate,
    )


def classify_support_intent_sync(message: str) -> ClassificationResult:
    """Synchronous wrapper for classify_support_intent, for use in non-async contexts."""
    import asyncio

    # If there's a running event loop, run in executor to avoid nested loop issues
    try:
        loop = asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(asyncio.run, classify_support_intent(message))
            return future.result(timeout=5)
    except RuntimeError:
        # No running loop — safe to use asyncio.run
        return asyncio.run(classify_support_intent(message))
