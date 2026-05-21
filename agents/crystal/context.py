"""CrystalContext — immutable request context passed to every Crystal tool."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class CrystalContext:
    org_id:        str
    user_id:       str
    survey_id:     str | None
    scope:         Literal["survey", "org"]
    run_id:        str | None = None
    has_open_text: bool = True
