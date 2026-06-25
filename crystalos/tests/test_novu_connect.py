"""Tests for novu_connect/adapter.py and novu_connect/message_processor.py."""
from __future__ import annotations

import json
import sys
import types
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_fake_redis_module(mock_redis_instance):
    """Return a fake 'crystalos.lib.redis' module with a get_redis coroutine."""
    module = types.ModuleType("crystalos.lib.redis")

    async def get_redis():
        return mock_redis_instance

    module.get_redis = get_redis
    return module


# ── adapter.py tests ──────────────────────────────────────────────────────────

class TestSendNovuReply:
    @pytest.mark.asyncio
    async def test_returns_skipped_when_no_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            # Reload the module's global to pick up the cleared env
            import importlib
            import crystalos.novu_connect.adapter as adapter_mod
            with patch.object(adapter_mod, "NOVU_API_KEY", ""):
                result = await adapter_mod.send_novu_reply("sub-123", "slack", "Hello")
        assert result["status"] == "skipped"
        assert "NOVU_API_KEY" in result.get("reason", "")

    @pytest.mark.asyncio
    async def test_posts_to_correct_url_when_key_set(self):
        import crystalos.novu_connect.adapter as adapter_mod

        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "ok"}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "NOVU_API_KEY", "test-key"), \
             patch("crystalos.novu_connect.adapter.httpx.AsyncClient", return_value=mock_client):
            result = await adapter_mod.send_novu_reply("sub-123", "slack", "Hello")

        assert result == {"status": "ok"}
        call_kwargs = mock_client.post.call_args
        url = call_kwargs[0][0]
        assert "https://api.novu.co/v1/events/trigger" == url

    @pytest.mark.asyncio
    async def test_sends_authorization_header_with_api_key(self):
        import crystalos.novu_connect.adapter as adapter_mod

        mock_response = MagicMock()
        mock_response.json.return_value = {}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "NOVU_API_KEY", "my-secret-key"), \
             patch("crystalos.novu_connect.adapter.httpx.AsyncClient", return_value=mock_client):
            await adapter_mod.send_novu_reply("sub-1", "email", "Hi")

        headers = mock_client.post.call_args[1]["headers"]
        assert headers["Authorization"] == "ApiKey my-secret-key"

    @pytest.mark.asyncio
    async def test_raises_on_non_2xx_response(self):
        import crystalos.novu_connect.adapter as adapter_mod
        import httpx

        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=MagicMock()
        )

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(adapter_mod, "NOVU_API_KEY", "some-key"), \
             patch("crystalos.novu_connect.adapter.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                await adapter_mod.send_novu_reply("sub-1", "slack", "test")


class TestUpsertNovuSubscriber:
    @pytest.mark.asyncio
    async def test_returns_silently_when_no_api_key(self):
        import crystalos.novu_connect.adapter as adapter_mod
        with patch.object(adapter_mod, "NOVU_API_KEY", ""):
            # Should not raise, returns None
            result = await adapter_mod.upsert_novu_subscriber("sub-1", email="a@b.com")
        assert result is None

    @pytest.mark.asyncio
    async def test_posts_to_subscribers_endpoint(self):
        import crystalos.novu_connect.adapter as adapter_mod

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock()

        with patch.object(adapter_mod, "NOVU_API_KEY", "test-key"), \
             patch("crystalos.novu_connect.adapter.httpx.AsyncClient", return_value=mock_client):
            await adapter_mod.upsert_novu_subscriber("sub-1")

        url = mock_client.post.call_args[0][0]
        assert "/v1/subscribers" in url

    @pytest.mark.asyncio
    async def test_does_not_raise_on_httpx_error(self):
        import crystalos.novu_connect.adapter as adapter_mod
        import httpx

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))

        with patch.object(adapter_mod, "NOVU_API_KEY", "test-key"), \
             patch("crystalos.novu_connect.adapter.httpx.AsyncClient", return_value=mock_client):
            # Must NOT raise — logs warning instead
            await adapter_mod.upsert_novu_subscriber("sub-1")

    @pytest.mark.asyncio
    async def test_passes_email_phone_first_name_when_provided(self):
        import crystalos.novu_connect.adapter as adapter_mod

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock()

        with patch.object(adapter_mod, "NOVU_API_KEY", "test-key"), \
             patch("crystalos.novu_connect.adapter.httpx.AsyncClient", return_value=mock_client):
            await adapter_mod.upsert_novu_subscriber(
                "sub-1", email="test@example.com", phone="+1555", first_name="Alice"
            )

        body = mock_client.post.call_args[1]["json"]
        assert body["email"] == "test@example.com"
        assert body["phone"] == "+1555"
        assert body["firstName"] == "Alice"


# ── message_processor.py tests ───────────────────────────────────────────────

class TestNovuMessage:
    def test_parses_all_fields_correctly(self):
        from crystalos.novu_connect.message_processor import NovuMessage

        raw = {
            "subscriberId": "sub-abc",
            "channel": "slack",
            "message": "What is my NPS?",
            "orgId": "org-1",
            "threadId": "thread-xyz",
            "metadata": {"survey_id": "sv-1"},
        }
        msg = NovuMessage(raw)
        assert msg.subscriber_id == "sub-abc"
        assert msg.channel == "slack"
        assert msg.message_text == "What is my NPS?"
        assert msg.org_id == "org-1"
        assert msg.thread_id == "thread-xyz"
        assert msg.metadata == {"survey_id": "sv-1"}

    def test_defaults_channel_to_in_app_when_not_provided(self):
        from crystalos.novu_connect.message_processor import NovuMessage

        msg = NovuMessage({"subscriberId": "sub-1", "message": "hi", "orgId": "org-1"})
        assert msg.channel == "in_app"

    def test_to_crystal_context_returns_survey_id_from_metadata(self):
        from crystalos.novu_connect.message_processor import NovuMessage

        msg = NovuMessage({
            "subscriberId": "sub-1",
            "orgId": "org-1",
            "message": "hello",
            "metadata": {"survey_id": "sv-99"},
        })
        ctx = msg.to_crystal_context()
        assert ctx["survey_id"] == "sv-99"

    def test_to_crystal_context_returns_none_survey_id_when_absent(self):
        from crystalos.novu_connect.message_processor import NovuMessage

        msg = NovuMessage({"subscriberId": "sub-1", "orgId": "org-1", "message": "hello"})
        ctx = msg.to_crystal_context()
        assert ctx["survey_id"] is None


class TestLoadThreadHistory:
    @pytest.mark.asyncio
    async def test_returns_empty_list_when_redis_key_does_not_exist(self):
        from crystalos.novu_connect.message_processor import _load_thread_history

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        fake_mod = _make_fake_redis_module(mock_redis)

        with patch.dict(sys.modules, {"crystalos.lib.redis": fake_mod}):
            result = await _load_thread_history("novu_thread:some-key")

        assert result == []

    @pytest.mark.asyncio
    async def test_returns_parsed_list_when_redis_has_data(self):
        from crystalos.novu_connect.message_processor import _load_thread_history

        history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=json.dumps(history))
        fake_mod = _make_fake_redis_module(mock_redis)

        with patch.dict(sys.modules, {"crystalos.lib.redis": fake_mod}):
            result = await _load_thread_history("novu_thread:some-key")

        assert result == history

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_redis_throws(self):
        from crystalos.novu_connect.message_processor import _load_thread_history

        bad_mod = types.ModuleType("crystalos.lib.redis")

        async def get_redis():
            raise Exception("Redis down")

        bad_mod.get_redis = get_redis

        with patch.dict(sys.modules, {"crystalos.lib.redis": bad_mod}):
            result = await _load_thread_history("novu_thread:broken-key")

        assert result == []


class TestSaveThreadHistory:
    @pytest.mark.asyncio
    async def test_appends_user_and_assistant_turn_to_history(self):
        from crystalos.novu_connect.message_processor import _save_thread_history, _NOVU_THREAD_TTL

        mock_redis = AsyncMock()
        mock_redis.setex = AsyncMock()
        fake_mod = _make_fake_redis_module(mock_redis)

        with patch.dict(sys.modules, {"crystalos.lib.redis": fake_mod}):
            await _save_thread_history("novu_thread:key", [], "user msg", "assistant reply")

        saved = json.loads(mock_redis.setex.call_args[0][2])
        assert len(saved) == 2
        assert saved[0] == {"role": "user", "content": "user msg"}
        assert saved[1] == {"role": "assistant", "content": "assistant reply"}

    @pytest.mark.asyncio
    async def test_trims_to_max_10_turns_when_history_grows_beyond_limit(self):
        from crystalos.novu_connect.message_processor import _save_thread_history

        # 10 turns already (20 entries), adding 1 more should trim to 20
        existing = [{"role": "user" if i % 2 == 0 else "assistant", "content": str(i)} for i in range(20)]

        mock_redis = AsyncMock()
        mock_redis.setex = AsyncMock()
        fake_mod = _make_fake_redis_module(mock_redis)

        with patch.dict(sys.modules, {"crystalos.lib.redis": fake_mod}):
            await _save_thread_history("novu_thread:key", existing, "new user", "new assistant")

        saved = json.loads(mock_redis.setex.call_args[0][2])
        assert len(saved) == 20  # trimmed to max 10 turns * 2 entries

    @pytest.mark.asyncio
    async def test_calls_setex_with_correct_ttl(self):
        from crystalos.novu_connect.message_processor import _save_thread_history, _NOVU_THREAD_TTL

        mock_redis = AsyncMock()
        mock_redis.setex = AsyncMock()
        fake_mod = _make_fake_redis_module(mock_redis)

        with patch.dict(sys.modules, {"crystalos.lib.redis": fake_mod}):
            await _save_thread_history("novu_thread:key", [], "u", "a")

        args = mock_redis.setex.call_args[0]
        assert args[0] == "novu_thread:key"
        assert args[1] == _NOVU_THREAD_TTL

    @pytest.mark.asyncio
    async def test_does_not_raise_when_redis_throws(self):
        from crystalos.novu_connect.message_processor import _save_thread_history

        bad_mod = types.ModuleType("crystalos.lib.redis")

        async def get_redis():
            raise Exception("Redis down")

        bad_mod.get_redis = get_redis

        with patch.dict(sys.modules, {"crystalos.lib.redis": bad_mod}):
            # Should silently swallow the error
            await _save_thread_history("novu_thread:key", [], "u", "a")


class TestProcessNovuMessage:
    def _make_msg(self, subscriber_id="sub-1", channel="in_app", thread_id=None):
        from crystalos.novu_connect.message_processor import NovuMessage
        return NovuMessage({
            "subscriberId": subscriber_id,
            "channel": channel,
            "message": "What is my NPS score?",
            "orgId": "org-1",
            "threadId": thread_id,
        })

    @pytest.mark.asyncio
    async def test_constructs_thread_id_from_subscriber_and_channel_when_not_provided(self):
        from crystalos.novu_connect.message_processor import process_novu_message

        saved_keys = []

        async def mock_load(key):
            return []

        async def mock_save(key, history, user_msg, reply):
            saved_keys.append(key)

        msg = self._make_msg(subscriber_id="sub-42", channel="slack", thread_id=None)

        with patch("crystalos.novu_connect.message_processor._load_thread_history", side_effect=mock_load), \
             patch("crystalos.novu_connect.message_processor._save_thread_history", side_effect=mock_save), \
             patch("crystalos.novu_connect.message_processor._invoke_crystal_conversational",
                   AsyncMock(return_value="Here is your NPS.")):
            await process_novu_message(msg, None)

        assert saved_keys[0] == "novu_thread:novu:sub-42:slack"

    @pytest.mark.asyncio
    async def test_loads_history_invokes_crystal_saves_history_in_sequence(self):
        from crystalos.novu_connect.message_processor import process_novu_message

        call_order = []

        async def mock_load(key):
            call_order.append("load")
            return []

        async def mock_invoke(message, context, history):
            call_order.append("invoke")
            return "reply text"

        async def mock_save(key, history, user_msg, reply):
            call_order.append("save")

        msg = self._make_msg()

        with patch("crystalos.novu_connect.message_processor._load_thread_history", side_effect=mock_load), \
             patch("crystalos.novu_connect.message_processor._invoke_crystal_conversational", side_effect=mock_invoke), \
             patch("crystalos.novu_connect.message_processor._save_thread_history", side_effect=mock_save):
            await process_novu_message(msg, None)

        assert call_order == ["load", "invoke", "save"]

    @pytest.mark.asyncio
    async def test_returns_error_message_string_when_crystal_invocation_throws(self):
        from crystalos.novu_connect.message_processor import process_novu_message

        async def mock_load(key):
            return []

        async def mock_invoke(message, context, history):
            raise RuntimeError("Crystal crashed")

        msg = self._make_msg()

        with patch("crystalos.novu_connect.message_processor._load_thread_history", side_effect=mock_load), \
             patch("crystalos.novu_connect.message_processor._invoke_crystal_conversational", side_effect=mock_invoke):
            result = await process_novu_message(msg, None)

        # Must return a string, not raise
        assert isinstance(result, str)
        assert len(result) > 0


class TestInvokeCrystalConversational:
    @pytest.mark.asyncio
    async def test_constructs_crystal_input_with_editor_role(self):
        from crystalos.novu_connect.message_processor import _invoke_crystal_conversational

        captured_inputs = []

        mock_output = MagicMock()
        mock_output.answer = "Insight result"

        async def mock_run(inp):
            captured_inputs.append(inp)
            return (mock_output, None)

        mock_agent = MagicMock()
        mock_agent.run = mock_run

        with patch("crystalos.agents.crystal.crystal_agent", mock_agent):
            await _invoke_crystal_conversational(
                "What is my NPS?",
                {"org_id": "org-1", "survey_id": "sv-1", "user_id": "u-1", "scope": "survey"},
                [],
            )

        assert len(captured_inputs) == 1
        assert captured_inputs[0].user_role == "editor"

    @pytest.mark.asyncio
    async def test_passes_conversation_history(self):
        from crystalos.novu_connect.message_processor import _invoke_crystal_conversational

        history = [{"role": "user", "content": "prev"}, {"role": "assistant", "content": "resp"}]
        captured_inputs = []

        mock_output = MagicMock()
        mock_output.answer = "response"

        async def mock_run(inp):
            captured_inputs.append(inp)
            return (mock_output, None)

        mock_agent = MagicMock()
        mock_agent.run = mock_run

        with patch("crystalos.agents.crystal.crystal_agent", mock_agent):
            await _invoke_crystal_conversational(
                "Follow-up question",
                {"org_id": "org-1", "survey_id": "sv-1", "user_id": "u-1", "scope": "survey"},
                history,
            )

        assert captured_inputs[0].conversation_history == history

    @pytest.mark.asyncio
    async def test_returns_output_answer_when_crystal_responds(self):
        from crystalos.novu_connect.message_processor import _invoke_crystal_conversational

        mock_output = MagicMock()
        mock_output.answer = "NPS is 42."

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=(mock_output, None))

        with patch("crystalos.agents.crystal.crystal_agent", mock_agent):
            result = await _invoke_crystal_conversational(
                "What is NPS?",
                {"org_id": "org-1", "survey_id": "sv-1", "user_id": "u-1", "scope": "survey"},
                [],
            )

        assert result == "NPS is 42."

    @pytest.mark.asyncio
    async def test_returns_fallback_message_when_crystal_raises(self):
        from crystalos.novu_connect.message_processor import _invoke_crystal_conversational

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(side_effect=RuntimeError("LLM timeout"))

        with patch("crystalos.agents.crystal.crystal_agent", mock_agent):
            result = await _invoke_crystal_conversational(
                "What is NPS?",
                {"org_id": "org-1", "survey_id": "sv-1", "user_id": "u-1", "scope": "survey"},
                [],
            )

        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_prepends_channel_hint_to_message_for_slack(self):
        """Channel hint is prepended in process_novu_message; _invoke_crystal_conversational receives it."""
        from crystalos.novu_connect.message_processor import process_novu_message, NovuMessage

        captured_messages = []

        async def mock_invoke(message, context, history):
            captured_messages.append(message)
            return "reply"

        msg = NovuMessage({
            "subscriberId": "sub-1",
            "channel": "slack",
            "message": "What is NPS?",
            "orgId": "org-1",
        })

        with patch("crystalos.novu_connect.message_processor._load_thread_history", AsyncMock(return_value=[])), \
             patch("crystalos.novu_connect.message_processor._save_thread_history", AsyncMock()), \
             patch("crystalos.novu_connect.message_processor._invoke_crystal_conversational", side_effect=mock_invoke):
            await process_novu_message(msg, None)

        # The message passed to _invoke should have a channel prefix
        assert "[Channel: slack]" in captured_messages[0]
