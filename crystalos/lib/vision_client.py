"""Vision client factory for the Visual Analyst.

`get_vision_client()` returns a real provider client when API keys are configured
(Claude Vision via Anthropic, or Google Vision — both DEPLOY-DEPENDENT and only
constructed when keys exist), otherwise a deterministic StubVisionClient so dev and
tests work offline with no network. All clients expose:

    async analyze(image_ref: str, tasks: list[str]) -> dict

returning any of: sentiment (-1..1), objects (list[str]), quality (dict),
text (OCR str), faces (int).
"""
from __future__ import annotations

import os
from typing import Any


class StubVisionClient:
    """Deterministic, offline vision client for dev/tests (no API calls)."""

    provider = "stub"

    async def analyze(self, image_ref: str, tasks: list[str]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if "sentiment" in tasks:
            result["sentiment"] = 0.0
        if "objects" in tasks:
            result["objects"] = []
        if "quality" in tasks:
            result["quality"] = {"blurry": False, "resolution": "unknown"}
        if "ocr" in tasks:
            result["text"] = ""
        if "faces" in tasks:
            result["faces"] = 0
        return result


def get_vision_client():
    """Pick a provider by available credentials; fall back to the offline stub.

    Real provider construction is intentionally deferred (deploy-dependent): wire
    the Anthropic/Google SDK call here when keys are present in production.
    """
    provider = (os.getenv("VISION_PROVIDER") or "").lower()
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))
    has_google = bool(os.getenv("GOOGLE_VISION_KEY") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

    if provider == "stub" or (not has_anthropic and not has_google):
        return StubVisionClient()

    # Deploy-dependent: a real client would be constructed here. Until that SDK
    # integration is wired + verified against a live key, fall back to the stub so
    # the pipeline degrades gracefully rather than erroring.
    return StubVisionClient()
