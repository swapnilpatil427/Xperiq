"""Crystal Visual Analyst — image analysis for survey responses.

Orchestrates a pluggable `vision_client` (Claude Vision / Google Vision in prod —
deploy-dependent, requires API keys) and enforces the privacy framework BEFORE
returning anything:
  - Facial/identity analysis is refused unless explicit consent is present.
  - Faces are reported as blurred (the actual pixel blur happens in the image
    pre-processing pipeline; this layer guarantees we never surface face data).
  - OCR text is PII-scrubbed (emails, phones) before it leaves this function.

Pure privacy logic + result shaping are deterministic and tested with a mock
vision client; the live vision call is exercised only when a real client is wired.
"""
from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\b(?:\+?\d[\d\-\s().]{7,}\d)\b")

DEFAULT_TASKS = ("sentiment", "objects", "quality", "ocr")


def redact_pii(text: str | None) -> str:
    if not text:
        return ""
    text = EMAIL_RE.sub("[email]", text)
    text = PHONE_RE.sub("[phone]", text)
    return text


async def analyze_image(
    vision_client,
    image_ref: str,
    *,
    tasks: tuple[str, ...] = DEFAULT_TASKS,
    blur_faces: bool = True,
    consent: bool = False,
) -> dict[str, Any]:
    """Analyze one image. Returns a privacy-safe result dict.

    `vision_client` must expose `async analyze(image_ref, tasks) -> dict` returning
    any of: sentiment, objects (list), quality (dict), text (OCR string), faces (int).
    """
    if not vision_client:
        return {"error": "vision_client_unavailable", "image_ref": image_ref}
    if not image_ref:
        return {"error": "image_ref required"}

    # Identity/facial analysis is gated on consent (GDPR). Never request it otherwise.
    requested = list(tasks)
    refused = []
    if "faces" in requested and not consent:
        requested.remove("faces")
        refused.append("faces")

    raw = await vision_client.analyze(image_ref, requested) or {}

    result: dict[str, Any] = {"image_ref": image_ref}
    if "sentiment" in raw:
        result["sentiment"] = raw["sentiment"]
    if "objects" in raw:
        result["objects"] = raw["objects"]
    if "quality" in raw:
        result["quality"] = raw["quality"]
    if "text" in raw:
        result["text"] = redact_pii(raw.get("text"))  # OCR — scrub PII

    # Privacy reporting: faces are never returned as data; report the blur status.
    faces = raw.get("faces", 0)
    if faces:
        result["faces_detected"] = int(faces)
        result["faces_blurred"] = bool(blur_faces)
    if refused:
        result["refused_tasks"] = refused  # e.g. facial analysis without consent

    return result


def classify_image_sentiment(result: dict[str, Any]) -> str:
    """Map a vision sentiment score (-1..1) to a label for aggregation."""
    s = result.get("sentiment")
    if s is None:
        return "unknown"
    try:
        s = float(s)
    except (TypeError, ValueError):
        return str(s)
    return "positive" if s > 0.2 else "negative" if s < -0.2 else "neutral"
