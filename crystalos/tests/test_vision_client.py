"""Tests for the vision client factory + offline stub."""
import pytest

from crystalos.lib.vision_client import get_vision_client, StubVisionClient


class TestFactory:
    def test_returns_stub_without_keys(self, monkeypatch):
        for k in ("VISION_PROVIDER", "ANTHROPIC_API_KEY", "GOOGLE_VISION_KEY", "GOOGLE_APPLICATION_CREDENTIALS"):
            monkeypatch.delenv(k, raising=False)
        assert isinstance(get_vision_client(), StubVisionClient)

    def test_explicit_stub_provider(self, monkeypatch):
        monkeypatch.setenv("VISION_PROVIDER", "stub")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")  # ignored when provider=stub
        assert isinstance(get_vision_client(), StubVisionClient)


class TestStub:
    @pytest.mark.asyncio
    async def test_returns_only_requested_tasks(self):
        client = StubVisionClient()
        r = await client.analyze("img://1", ["sentiment", "objects", "ocr"])
        assert set(r.keys()) == {"sentiment", "objects", "text"}
        assert r["sentiment"] == 0.0
        assert r["objects"] == []
        assert r["text"] == ""

    @pytest.mark.asyncio
    async def test_faces_zero_by_default(self):
        client = StubVisionClient()
        r = await client.analyze("img://1", ["faces"])
        assert r["faces"] == 0

    @pytest.mark.asyncio
    async def test_integrates_with_analyze_image(self):
        from crystalos.lib.visual_analyst import analyze_image
        client = get_vision_client()
        r = await analyze_image(client, "img://1", tasks=("sentiment", "ocr"))
        assert r["image_ref"] == "img://1"
        assert "sentiment" in r
