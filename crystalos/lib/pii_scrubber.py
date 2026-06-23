"""PII scrubber for trace inputs and LLM context.

Scrubs email, phone, SSN, credit card, and IP address patterns before
data reaches external services (Langfuse traces, etc.).

Fast regex pass — ~0.1ms for typical inputs. Never mutates input.
"""
from __future__ import annotations

import re
from typing import Any

# Check if security.py already defines these — import or define locally
try:
    from crystalos.lib.security import _PII_PATTERNS as _IMPORTED_PATTERNS  # type: ignore[attr-defined]
    _PII_PATTERNS = _IMPORTED_PATTERNS
except (ImportError, AttributeError):
    _PII_PATTERNS: list[tuple[re.Pattern, str]] = [
        (re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", re.I), "[EMAIL]"),
        (re.compile(r"\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE]"),
        (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
        (re.compile(r"\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b"), "[CC]"),
        (re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"), "[IP]"),
    ]


def scrub(text: str) -> str:
    """Replace PII patterns in a string. Returns a new string."""
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def scrub_dict(data: Any) -> Any:
    """Recursively scrub all string values in a dict or list. Returns a new object."""
    if isinstance(data, str):
        return scrub(data)
    if isinstance(data, dict):
        return {k: scrub_dict(v) for k, v in data.items()}
    if isinstance(data, list):
        return [scrub_dict(item) for item in data]
    return data
