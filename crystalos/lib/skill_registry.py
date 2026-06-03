"""CrystalOS Skill Registry — discovers, indexes, and executes skills.

Skills live in agents/skills/<skill-name>/SKILL.md.
The registry scans at startup and reindexes periodically (mtime-based).
Discovery uses token-overlap scoring via difflib — no vector deps needed.

Usage:
    registry = get_registry()
    await registry.initialize()
    meta = registry.get_skill_meta("insight-narrator")
    result = await registry.execute("insight-narrator", input_data, ctx)
"""
from __future__ import annotations

import asyncio
import difflib
import time
from pathlib import Path
from typing import Any

import yaml

from crystalos.lib.logger import logger

_registry: "SkillRegistry | None" = None


def get_registry(skills_dir: Path | None = None) -> "SkillRegistry":
    global _registry
    if _registry is None:
        _registry = SkillRegistry(skills_dir=skills_dir)
    return _registry


class SkillRegistry:
    """Discovers SKILL.md files, indexes metadata, and dispatches execution."""

    def __init__(self, skills_dir: Path | None = None):
        self._skills_dir = skills_dir or Path(__file__).parent.parent / "skills"
        self._skills: dict[str, dict] = {}    # name → metadata
        self._mtimes: dict[str, float] = {}   # skill_md_path → mtime
        self._initialized = False
        self._reload_task: asyncio.Task | None = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Scan skills directory and start background reload task."""
        self._scan_skills()
        self._initialized = True
        try:
            loop = asyncio.get_event_loop()
            self._reload_task = loop.create_task(self._reload_loop())
        except RuntimeError:
            pass  # No event loop in test context — reload disabled
        logger.info(
            "skill_registry_initialized",
            skill_count=len(self._skills),
            skills=sorted(self._skills.keys()),
        )

    def _scan_skills(self) -> None:
        """Scan skills_dir recursively for SKILL.md files and parse frontmatter."""
        found: dict[str, dict] = {}
        mtimes: dict[str, float] = {}
        for skill_md in sorted(self._skills_dir.rglob("SKILL.md")):
            try:
                meta = self._parse_skill_md(skill_md)
                if not meta:
                    continue
                name = meta["name"]
                if name in found:
                    logger.warning("skill_duplicate_name", name=name, path=str(skill_md))
                    continue
                found[name] = meta
                mtimes[str(skill_md)] = skill_md.stat().st_mtime
                logger.debug("skill_loaded", name=name, version=meta.get("version"), path=str(skill_md))
            except Exception as exc:
                logger.warning("skill_load_failed", path=str(skill_md), error=str(exc))
        self._skills = found
        self._mtimes = mtimes

    def _parse_skill_md(self, path: Path) -> dict | None:
        """Parse SKILL.md frontmatter (---yaml--- block) and return metadata dict."""
        from crystalos.lib.constants import SKILL_DEFAULT_TIMEOUT_SECONDS, SKILL_DEFAULT_MAX_RETRIES

        text = path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            logger.warning("skill_no_frontmatter", path=str(path))
            return None

        end = text.find("\n---", 3)
        if end == -1:
            logger.warning("skill_unclosed_frontmatter", path=str(path))
            return None

        front_raw = text[3:end].strip()
        body = text[end + 4:].strip()

        try:
            front = yaml.safe_load(front_raw)
        except yaml.YAMLError as exc:
            logger.warning("skill_yaml_parse_failed", path=str(path), error=str(exc))
            return None

        if not isinstance(front, dict) or "name" not in front:
            logger.warning("skill_missing_name", path=str(path))
            return None

        allowed_raw = front.get("allowed-tools", "") or ""
        allowed_tools = allowed_raw.split() if isinstance(allowed_raw, str) else list(allowed_raw)

        return {
            "name": str(front["name"]),
            "version": str(front.get("version", "1.0.0")),
            "shared": bool(front.get("shared", False)),
            "description": str(front.get("description", "")).strip(),
            "compatibility": str(front.get("compatibility", "")).strip(),
            "allowed_tools": allowed_tools,
            "evals": str(front.get("evals", "EVALS.md")),
            "examples": str(front.get("examples", "EXAMPLES.md")),
            "max_output_tokens": int(front.get("max_output_tokens", 2000)),
            "max_retries": int(front.get("max_retries", SKILL_DEFAULT_MAX_RETRIES)),
            "timeout_seconds": int(front.get("timeout_seconds", SKILL_DEFAULT_TIMEOUT_SECONDS)),
            "_path": str(path),
            "_dir": str(path.parent),
            "_body": body,
        }

    # ── Discovery ─────────────────────────────────────────────────────────────

    def find(self, query: str) -> str | None:
        """Find the best matching skill name for a free-text query.

        Uses token-overlap scoring (difflib). For hard-coded orchestrator calls
        use execute() directly — bypasses discovery entirely.
        """
        if not self._skills:
            return None
        query_lower = query.lower()
        best_name: str | None = None
        best_score = 0.0
        for name, meta in self._skills.items():
            search_text = f"{name} {meta.get('description', '')}".lower()
            score = difflib.SequenceMatcher(None, query_lower, search_text).ratio()
            # Boost if query tokens appear in name
            if any(tok in name for tok in query_lower.split() if len(tok) > 3):
                score += 0.25
            if score > best_score:
                best_score = score
                best_name = name
        return best_name if best_score > 0.2 else None

    # ── Execution ─────────────────────────────────────────────────────────────

    async def execute(self, skill_name: str, input_data: dict, ctx: dict) -> dict:
        """Execute a named skill and return its result as a dict.

        Raises ValueError if skill_name is not registered.
        """
        meta = self._skills.get(skill_name)
        if not meta:
            available = sorted(self._skills.keys())
            raise ValueError(
                f"Skill {skill_name!r} not found. Available: {available}"
            )
        from crystalos.lib.skill_runtime import SkillRuntime
        runtime = SkillRuntime()
        result = await runtime.execute(skill_name, meta, input_data, ctx)
        return {
            "output": result.output,
            "eval_score": result.eval_score,
            "eval_passed": result.eval_passed,
            "eval_issues": result.eval_issues,
            "retried": result.retried,
            "skill_name": result.skill_name,
            "skill_version": result.skill_version,
            "model": result.model,
            "tokens_used": result.tokens_used,
            "latency_ms": result.latency_ms,
        }

    # ── Inspection ────────────────────────────────────────────────────────────

    def list_skills(self) -> list[dict]:
        """Return public metadata for all registered skills (used by /agents/registry)."""
        return [
            {
                "name": m["name"],
                "version": m["version"],
                "shared": m["shared"],
                "description": m["description"][:200],
                "allowed_tools": m["allowed_tools"],
                "timeout_seconds": m["timeout_seconds"],
                "max_output_tokens": m["max_output_tokens"],
            }
            for m in sorted(self._skills.values(), key=lambda x: x["name"])
        ]

    def get_skill_meta(self, skill_name: str) -> dict | None:
        return self._skills.get(skill_name)

    def is_initialized(self) -> bool:
        return self._initialized

    # ── Hot reload ────────────────────────────────────────────────────────────

    async def _reload_if_changed(self) -> None:
        changed = False
        for path_str, old_mtime in list(self._mtimes.items()):
            p = Path(path_str)
            if not p.exists() or p.stat().st_mtime != old_mtime:
                changed = True
                break
        # Also check for newly added skill dirs
        current_paths = {str(p) for p in self._skills_dir.rglob("SKILL.md")}
        if current_paths != set(self._mtimes.keys()):
            changed = True
        if changed:
            logger.info("skill_registry_reloading")
            self._scan_skills()

    async def _reload_loop(self) -> None:
        from crystalos.lib.constants import (
            SKILL_REGISTRY_RELOAD_INTERVAL_DEV,
            SKILL_REGISTRY_RELOAD_INTERVAL_PROD,
        )
        from crystalos.lib.models import get_env
        interval = (
            SKILL_REGISTRY_RELOAD_INTERVAL_PROD
            if get_env() == "prod"
            else SKILL_REGISTRY_RELOAD_INTERVAL_DEV
        )
        while True:
            await asyncio.sleep(interval)
            try:
                await self._reload_if_changed()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("skill_registry_reload_error", error=str(exc))
