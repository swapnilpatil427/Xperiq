"""Tests for the Crystal Visual Analyst (image analysis + privacy framework)."""
import pytest
from unittest.mock import AsyncMock

from crystalos.lib.visual_analyst import (
    analyze_image, redact_pii, classify_image_sentiment, DEFAULT_TASKS,
)


class TestRedactPii:
    def test_scrubs_emails_and_phones(self):
        out = redact_pii("Contact me at jane@acme.com or +1 (555) 123-4567 please")
        assert "jane@acme.com" not in out and "[email]" in out
        assert "555" not in out and "[phone]" in out

    def test_empty(self):
        assert redact_pii(None) == ""


class TestAnalyzeImage:
    @pytest.mark.asyncio
    async def test_returns_shaped_result_and_scrubs_ocr(self):
        client = AsyncMock()
        client.analyze = AsyncMock(return_value={
            "sentiment": 0.6, "objects": ["receipt", "table"],
            "quality": {"blurry": False}, "text": "email me at bob@x.io",
        })
        r = await analyze_image(client, "img://1", tasks=DEFAULT_TASKS)
        assert r["objects"] == ["receipt", "table"]
        assert r["text"] == "email me at [email]"
        assert r["sentiment"] == 0.6

    @pytest.mark.asyncio
    async def test_refuses_facial_analysis_without_consent(self):
        client = AsyncMock()
        client.analyze = AsyncMock(return_value={"sentiment": 0.1})
        r = await analyze_image(client, "img://1", tasks=("sentiment", "faces"), consent=False)
        assert "faces" in r.get("refused_tasks", [])
        # The vision client must not have been asked to analyze faces.
        called_tasks = client.analyze.call_args[0][1]
        assert "faces" not in called_tasks

    @pytest.mark.asyncio
    async def test_blurs_faces_and_never_returns_face_data(self):
        client = AsyncMock()
        client.analyze = AsyncMock(return_value={"faces": 3, "sentiment": 0.0})
        r = await analyze_image(client, "img://1", blur_faces=True)
        assert r["faces_detected"] == 3
        assert r["faces_blurred"] is True
        assert "faces" not in r  # raw face data never surfaced

    @pytest.mark.asyncio
    async def test_handles_missing_client(self):
        r = await analyze_image(None, "img://1")
        assert r["error"] == "vision_client_unavailable"


class TestClassifySentiment:
    def test_thresholds(self):
        assert classify_image_sentiment({"sentiment": 0.5}) == "positive"
        assert classify_image_sentiment({"sentiment": -0.5}) == "negative"
        assert classify_image_sentiment({"sentiment": 0.0}) == "neutral"
        assert classify_image_sentiment({}) == "unknown"
