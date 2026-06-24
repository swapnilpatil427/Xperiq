"""Tests for Crystal three-layer anomaly detection (changepoint + detector)."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from crystalos.lib.changepoint import detect_changepoint
from crystalos.lib.anomaly_detector import detect, classify_severity, record_anomaly_alert


class TestChangepoint:
    def test_detects_a_clear_mean_shift(self):
        series = [10, 11, 9, 10, 11, 10, 30, 31, 29, 30, 31]
        cp = detect_changepoint(series)
        assert cp is not None
        assert cp.index == 6
        assert cp.mean_after > cp.mean_before
        assert cp.delta > 15

    def test_no_changepoint_on_flat_series(self):
        assert detect_changepoint([10, 10, 10, 10, 10, 10]) is None

    def test_no_changepoint_on_pure_noise_below_penalty(self):
        cp = detect_changepoint([10, 11, 10, 9, 10, 11, 10, 9], penalty_ratio=0.5)
        assert cp is None

    def test_too_short_returns_none(self):
        assert detect_changepoint([10, 20]) is None


class TestDetect:
    def test_flags_a_spike(self):
        series = [10, 11, 9, 10, 11, 10, 9, 45]  # last point is a big spike
        r = detect(series, metric="Response volume")
        assert r.detected is True
        assert r.z_score > 2.5
        assert r.severity in ("warning", "critical")
        assert "Response volume" in r.narration
        assert "RECOMMENDED ACTION" in r.narration

    def test_no_anomaly_on_stable_series(self):
        r = detect([10, 11, 9, 10, 11, 10, 9, 10])
        assert r.detected is False

    def test_needs_minimum_points(self):
        assert detect([10, 50]).detected is False

    def test_severity_classification(self):
        assert classify_severity(4.0) == "critical"
        assert classify_severity(3.0) == "warning"
        assert classify_severity(1.0) == "info"


class TestRecordAnomalyAlert:
    @pytest.mark.asyncio
    async def test_inserts_ruleless_event_and_publishes(self, monkeypatch):
        # Mock the notification bridge publish.
        published = {}
        async def fake_publish(redis_client, **kwargs):
            published.update(kwargs); return "1-0"
        import crystalos.lib.notification_bridge as bridge
        monkeypatch.setattr(bridge, "publish_notification_event", fake_publish)

        cur = AsyncMock()
        cur.execute = AsyncMock()
        cur.fetchone = AsyncMock(return_value=("alert-evt-1",))
        cur.__aenter__ = AsyncMock(return_value=cur)
        cur.__aexit__ = AsyncMock(return_value=False)
        conn = MagicMock()
        conn.cursor = MagicMock(return_value=cur)

        from crystalos.lib.anomaly_detector import AnomalyResult
        result = AnomalyResult(detected=True, z_score=4.1, severity="critical",
                               narration="NPS dropped sharply.", metric_value=30, baseline=42)
        event_id = await record_anomaly_alert(conn, AsyncMock(), org_id="o1", survey_id="s1",
                                              metric="NPS", result=result)
        assert event_id == "alert-evt-1"
        # First execute = INSERT alert_events, with rule_id NULL + source 'crystal'.
        insert_sql = cur.execute.call_args_list[0][0][0]
        assert "INSERT INTO alert_events" in insert_sql
        assert "NULL" in insert_sql and "'crystal'" in insert_sql
        assert published["type"] == "crystal.anomaly_detected"
        assert published["priority"] == "critical"

    @pytest.mark.asyncio
    async def test_noop_when_not_detected(self):
        from crystalos.lib.anomaly_detector import AnomalyResult
        conn = MagicMock()
        out = await record_anomaly_alert(conn, AsyncMock(), org_id="o1", survey_id="s1",
                                         metric="NPS", result=AnomalyResult(detected=False))
        assert out is None
