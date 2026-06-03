"""Tests for agents/lib/pii_scrubber.py"""
from __future__ import annotations

import pytest

from crystalos.lib.pii_scrubber import scrub, scrub_dict


def test_scrub_email():
    result = scrub("Contact us at support@example.com for help.")
    assert "[EMAIL]" in result
    assert "support@example.com" not in result


def test_scrub_phone_us():
    result = scrub("Call 555-123-4567 now.")
    assert "[PHONE]" in result
    assert "555-123-4567" not in result


def test_scrub_phone_with_country_code():
    result = scrub("International: +1 (800) 555-0199")
    assert "[PHONE]" in result


def test_scrub_ssn():
    result = scrub("SSN: 123-45-6789")
    assert "[SSN]" in result
    assert "123-45-6789" not in result


def test_scrub_credit_card():
    result = scrub("Card: 4111 1111 1111 1111")
    assert "[CC]" in result
    assert "4111 1111 1111 1111" not in result


def test_scrub_ip_address():
    result = scrub("Server at 192.168.1.100")
    assert "[IP]" in result
    assert "192.168.1.100" not in result


def test_scrub_no_pii_unchanged():
    clean = "The customer said the onboarding process was too long."
    result = scrub(clean)
    assert result == clean


def test_scrub_multiple_pii():
    text = "Email john@test.com or call 555-999-8888 from IP 10.0.0.1"
    result = scrub(text)
    assert "[EMAIL]" in result
    assert "[PHONE]" in result
    assert "[IP]" in result
    assert "john@test.com" not in result


def test_scrub_dict_string_values():
    data = {"email": "user@example.com", "note": "no pii here"}
    result = scrub_dict(data)
    assert result["email"] == "[EMAIL]"
    assert result["note"] == "no pii here"


def test_scrub_dict_nested():
    data = {
        "user": {
            "email": "user@example.com",
            "phone": "555-123-4567",
        },
        "meta": {"tags": ["important"]},
    }
    result = scrub_dict(data)
    assert result["user"]["email"] == "[EMAIL]"
    assert result["user"]["phone"] == "[PHONE]"
    assert result["meta"]["tags"] == ["important"]  # Unchanged


def test_scrub_dict_list_values():
    data = {"contacts": ["a@b.com", "no pii", "c@d.org"]}
    result = scrub_dict(data)
    assert result["contacts"][0] == "[EMAIL]"
    assert result["contacts"][1] == "no pii"
    assert result["contacts"][2] == "[EMAIL]"


def test_scrub_dict_does_not_mutate():
    original = {"email": "user@example.com"}
    _ = scrub_dict(original)
    assert original["email"] == "user@example.com"  # Original unchanged


def test_scrub_dict_non_dict_passthrough():
    assert scrub_dict(42) == 42
    assert scrub_dict(None) is None
    assert scrub_dict(True) is True


def test_scrub_empty_string():
    assert scrub("") == ""


def test_scrub_dict_empty():
    assert scrub_dict({}) == {}
