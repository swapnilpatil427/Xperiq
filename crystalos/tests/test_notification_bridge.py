"""Unit tests for the Crystal → notification bridge."""
import json
import pytest
from unittest.mock import AsyncMock

from crystalos.lib.notification_bridge import (
    narrate, publish_notification_event, notify_insight_complete, STREAM_KEY,
)


class TestNarrate:
    def test_uses_explicit_summary_when_present(self):
        assert narrate("score.nps_drop", {"crystalSummary": "custom"}) == "custom"

    def test_nps_drop_with_driver(self):
        msg = narrate("score.nps_drop", {"old": 42, "new": 34, "driver": "shipping delays"})
        assert "42" in msg and "34" in msg and "shipping delays" in msg

    def test_insight_ready_pluralization(self):
        assert "1 key insight " in narrate("crystal.insight_ready", {"insightCount": 1, "responseCount": 50})
        assert "2 key insights" in narrate("crystal.insight_ready", {"insightCount": 2})

    def test_milestone(self):
        assert "100 responses" in narrate("survey.milestone", {"milestone": 100})

    def test_fallback_humanizes_type(self):
        assert narrate("system.credits_low", {}) == "System credits low."


class TestPublish:
    @pytest.mark.asyncio
    async def test_publishes_with_matching_field_names(self):
        redis = AsyncMock()
        redis.xadd = AsyncMock(return_value="1-0")
        msg_id = await publish_notification_event(
            redis, type="crystal.insight_ready", org_id="o1",
            entity_type="survey", entity_id="s1", priority="info",
            payload={"insightCount": 3, "responseCount": 120},
        )
        assert msg_id == "1-0"
        args, kwargs = redis.xadd.call_args
        assert args[0] == STREAM_KEY
        fields = args[1]
        # Field names mirror the Node consumer (parseEventFields).
        assert fields["type"] == "crystal.insight_ready"
        assert fields["org_id"] == "o1"
        assert json.loads(fields["target_user_ids"]) == []
        # Narration baked into payload + body.
        payload = json.loads(fields["payload"])
        assert "crystalSummary" in payload
        assert fields["body"] == payload["crystalSummary"]

    @pytest.mark.asyncio
    async def test_returns_none_without_redis(self):
        assert await publish_notification_event(None, type="x", org_id="o1") is None

    @pytest.mark.asyncio
    async def test_notify_insight_complete(self):
        redis = AsyncMock()
        redis.xadd = AsyncMock(return_value="2-0")
        await notify_insight_complete(redis, "o1", "s1", ["i1", "i2"], "Found 2 themes", response_count=80)
        fields = redis.xadd.call_args[0][1]
        payload = json.loads(fields["payload"])
        assert payload["insightCount"] == 2
        assert payload["actionUrl"] == "/app/surveys/s1/insights"
