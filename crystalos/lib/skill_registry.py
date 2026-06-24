"""Agents Skill Registry — discovers, indexes, and executes skills.

Skills live in agents/skills/<skill-name>/SKILL.md.
The registry scans at startup and reindexes periodically (mtime-based).
Discovery uses token-overlap scoring via difflib — no vector deps needed.
Semantic routing via pre-embedded skill descriptions is available after warm_router().

Usage:
    registry = get_registry()
    await registry.initialize()
    meta = registry.get_skill_meta("insight-narrator")
    result = await registry.execute("insight-narrator", input_data, ctx)
"""
from __future__ import annotations

import asyncio
import difflib
import hashlib
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from crystalos.lib.logger import logger

_registry: "SkillRegistry | None" = None


@dataclass
class SkillVariant:
    """Tracks A/B variant metadata for a skill."""
    skill_name: str
    variant: str
    rollout_pct: int
    baseline: str | None
    min_sample_size: int
    meta: dict  # full skill metadata dict


def get_registry(skills_dir: Path | None = None) -> "SkillRegistry":
    global _registry
    if _registry is None:
        _registry = SkillRegistry(skills_dir=skills_dir)
    return _registry


def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


class SkillRegistry:
    """Discovers SKILL.md files, indexes metadata, and dispatches execution."""

    def __init__(self, skills_dir: Path | None = None):
        self._skills_dir = skills_dir or Path(__file__).parent.parent / "skills"
        self._skills: dict[str, dict] = {}    # name → metadata
        self._mtimes: dict[str, float] = {}   # skill_md_path → mtime
        self._variants: dict[str, list[SkillVariant]] = {}  # base_name → [variants]
        self._initialized = False
        self._reload_task: asyncio.Task | None = None
        self._embeddings: dict[str, list[float]] = {}
        self._router_ready: bool = False

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
        variants: dict[str, list[SkillVariant]] = {}

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

                # Register variant for A/B testing
                base_name = meta.get("_base_name", name)
                sv = SkillVariant(
                    skill_name=name,
                    variant=meta.get("variant", "default"),
                    rollout_pct=meta.get("rollout_pct", 100),
                    baseline=meta.get("baseline_variant"),
                    min_sample_size=meta.get("min_sample_size", 100),
                    meta=meta,
                )
                variants.setdefault(base_name, []).append(sv)

            except Exception as exc:
                logger.warning("skill_load_failed", path=str(skill_md), error=str(exc))
        self._skills = found
        self._mtimes = mtimes
        self._variants = variants

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

        # A/B variant fields
        raw_name = str(front["name"])
        base_name = raw_name.split("@")[0] if "@" in raw_name else raw_name
        variant = str(front.get("variant", "default"))
        rollout_pct = int(front.get("rollout_pct", 100))
        baseline_variant = front.get("baseline_variant")
        if baseline_variant is not None:
            baseline_variant = str(baseline_variant)
        min_sample_size = int(front.get("min_sample_size", 100))

        return {
            "name": raw_name,
            "_base_name": base_name,
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
            "variant": variant,
            "rollout_pct": rollout_pct,
            "baseline_variant": baseline_variant,
            "min_sample_size": min_sample_size,
            "_path": str(path),
            "_dir": str(path.parent),
            "_body": body,
        }

    # ── Discovery ─────────────────────────────────────────────────────────────

    def find_sync(self, query: str) -> str | None:
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

    async def warm_router(self) -> None:
        """Pre-embed all skill descriptions for semantic search. Call at startup."""
        if not self._skills:
            return
        texts = {
            name: f"{meta.get('name', name)}: {meta.get('description', '')}. {' '.join(meta.get('use_cases', []))}"
            for name, meta in self._skills.items()
        }
        from crystalos.tools.embeddings import embed_texts
        try:
            text_list = list(texts.values())
            name_list = list(texts.keys())
            vectors = await embed_texts(text_list, org_id="system", survey_id="skill-router")
            self._embeddings = dict(zip(name_list, vectors))
            self._router_ready = True
            logger.info("skill_router_warmed", skill_count=len(self._embeddings))
        except Exception as exc:
            logger.warning("skill_router_warm_failed", error=str(exc))
            self._router_ready = False

    async def find(self, query: str, top_k: int = 3) -> list[tuple[dict, float]]:
        """Semantic skill search — returns up to top_k skills with similarity scores.

        Falls back to difflib find_sync() if router not warmed.
        Minimum similarity threshold: 0.35.
        """
        if not self._router_ready or not self._embeddings:
            # Graceful degradation: use difflib
            sync_result = self.find_sync(query)
            if sync_result and sync_result in self._skills:
                return [(self._skills[sync_result], 0.5)]
            return []

        from crystalos.tools.embeddings import embed_texts
        try:
            vectors = await embed_texts([query], org_id="system", survey_id="skill-router")
            if not vectors:
                return []
            q_embedding = vectors[0]
        except Exception as exc:
            logger.warning("skill_find_embed_failed", error=str(exc))
            return []

        scored: list[tuple[dict, float]] = []
        for skill_name, skill_embedding in self._embeddings.items():
            sim = _cosine_sim(q_embedding, skill_embedding)
            if sim > 0.35:
                scored.append((self._skills[skill_name], sim))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    async def find_with_scores(self, query: str, top_k: int = 5) -> list[dict]:
        """Find top-k matching skills with scores — semantic if router is warm, difflib fallback.

        Returns list of {name, score} dicts sorted descending by score.
        """
        semantic_results = await self.find(query, top_k=top_k)
        if semantic_results:
            return [{"name": m["name"], "score": round(s, 4)} for m, s in semantic_results]
        # Difflib fallback
        scored: list[tuple[float, str]] = []
        query_lower = query.lower()
        for name, meta in self._skills.items():
            search_text = f"{name} {meta.get('description', '')}".lower()
            score = difflib.SequenceMatcher(None, query_lower, search_text).ratio()
            if any(tok in name for tok in query_lower.split() if len(tok) > 3):
                score += 0.25
            if score > 0.2:
                scored.append((score, name))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [{"name": name, "score": round(score, 4)} for score, name in scored[:top_k]]

    def resolve_variant(self, skill_name: str, request_hash: str) -> dict | None:
        """Resolve which skill variant to use for this request hash.

        Uses consistent hashing (MD5 % 100) for deterministic per-user A/B assignment.
        Falls back to the first registered variant if no rollout range matches.
        """
        variants = self._variants.get(skill_name)
        if not variants:
            return self._skills.get(skill_name)
        if len(variants) == 1:
            return variants[0].meta
        bucket = int(hashlib.md5(request_hash.encode()).hexdigest(), 16) % 100
        sorted_variants = sorted(variants, key=lambda v: v.rollout_pct)
        cumulative = 0
        for sv in sorted_variants:
            cumulative += sv.rollout_pct
            if bucket < cumulative:
                return sv.meta
        return variants[0].meta

    def list_variants(self, skill_name: str) -> list[dict]:
        """Return variant info for a skill — used by the admin Skill Browser API."""
        variants = self._variants.get(skill_name, [])
        return [
            {
                "skill_name": sv.skill_name,
                "variant": sv.variant,
                "rollout_pct": sv.rollout_pct,
                "baseline": sv.baseline,
                "min_sample_size": sv.min_sample_size,
            }
            for sv in variants
        ]

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
                "variant": m.get("variant", "default"),
                "rollout_pct": m.get("rollout_pct", 100),
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
