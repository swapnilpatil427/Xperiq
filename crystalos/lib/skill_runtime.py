"""CrystalOS Skill Runtime — loads and executes a single skill end-to-end.

Responsibilities:
  - Load SKILL.md body + reference files
  - Inject top-3 few-shot examples from skill_examples DB table
  - Call LLM via call_agent() using appropriate model config
  - Parse and validate JSON output
  - Run EVALS.md quality checks
  - Retry once on eval failure with failure context injected
  - Write passing examples to skill_examples table (async, non-blocking)
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict

from crystalos.lib.logger import logger


class _SkillOutput(BaseModel):
    """Open-ended output model — accepts any JSON fields returned by the LLM."""
    model_config = ConfigDict(extra="allow")

    def to_dict(self) -> dict:
        return self.model_dump()


@dataclass
class SkillResult:
    output: dict
    eval_score: float
    eval_passed: bool
    eval_issues: list[str]
    retried: bool
    skill_name: str
    skill_version: str
    model: str
    tokens_used: int
    latency_ms: float
    reasoning_trace: dict = field(default_factory=dict)


class SkillRuntime:
    """Stateless executor for a skill given its metadata dict from SkillRegistry."""

    async def execute(
        self,
        skill_name: str,
        skill_meta: dict,
        input_data: dict,
        ctx: dict,
    ) -> SkillResult:
        from crystalos.lib.constants import SKILL_EVAL_PASS_THRESHOLD, SKILL_EXAMPLE_WRITE_THRESHOLD
        from crystalos.lib.models import get_skill_model
        from crystalos.lib.openrouter import call_agent
        from crystalos.lib.tracer import get_tracer as _get_tracer

        t0 = time.monotonic()

        # Model resolution: get_skill_model() looks up _SKILL_ROUTING[env][skill_name]
        # and falls back to insight_narrate if the skill has no explicit entry.
        model_cfg = get_skill_model(skill_name)

        skill_version = skill_meta.get("version", "1.0.0")
        timeout = skill_meta.get("timeout_seconds", 60)
        max_output_tokens = min(
            skill_meta.get("max_output_tokens", model_cfg.max_tokens),
            model_cfg.max_tokens,
        )
        max_retries = skill_meta.get("max_retries", 1)

        # Build system prompt (SKILL.md body + references + examples)
        system = await self._build_system(skill_meta, input_data)
        user_msg = json.dumps(input_data, ensure_ascii=False, indent=2)

        output_raw: dict = {}
        model_used: str = model_cfg.model
        tokens_used = 0

        # ── First attempt ──────────────────────────────────────────────────
        try:
            result, credit = await asyncio.wait_for(
                call_agent(
                    agent_name=skill_name,
                    system=system,
                    user=user_msg,
                    output_schema=_SkillOutput,
                    current_tokens=ctx.get("current_tokens", 0),
                ),
                timeout=float(timeout),
            )
            output_raw = result.to_dict() if hasattr(result, "to_dict") else {}
            if hasattr(credit, "model"):
                model_used = credit.model
                tokens_used = credit.input_tokens + credit.output_tokens
            elif isinstance(credit, dict):
                model_used = credit.get("model", model_used)
                tokens_used = credit.get("input_tokens", 0) + credit.get("output_tokens", 0)
        except asyncio.TimeoutError:
            logger.warning("skill_timeout", skill=skill_name, timeout_seconds=timeout)
            return SkillResult(
                output={"error": f"Timed out after {timeout}s"},
                eval_score=0.0,
                eval_passed=False,
                eval_issues=[f"Timeout after {timeout}s"],
                retried=False,
                skill_name=skill_name,
                skill_version=skill_version,
                model=model_used,
                tokens_used=0,
                latency_ms=(time.monotonic() - t0) * 1000,
            )
        except Exception as exc:
            logger.error("skill_execution_error", skill=skill_name, error=str(exc))
            return SkillResult(
                output={"error": str(exc)},
                eval_score=0.0,
                eval_passed=False,
                eval_issues=[str(exc)[:120]],
                retried=False,
                skill_name=skill_name,
                skill_version=skill_version,
                model=model_used,
                tokens_used=tokens_used,
                latency_ms=(time.monotonic() - t0) * 1000,
            )

        # ── Eval check ─────────────────────────────────────────────────────
        eval_score, eval_passed, eval_issues = self._check_evals(skill_meta, input_data, output_raw)
        retried = False

        # ── Retry on failure ───────────────────────────────────────────────
        if not eval_passed and max_retries > 0:
            retried = True
            retry_ctx = {
                "retry_reason": "eval_failure",
                "failed_criteria": eval_issues,
                "eval_score": round(eval_score, 3),
                "previous_output": output_raw,
                "instruction": (
                    "Your previous response did not meet quality criteria. "
                    "The issues are listed in failed_criteria. Fix them and respond again."
                ),
            }
            retry_user = json.dumps({"input": input_data, "retry_context": retry_ctx}, indent=2)
            try:
                result2, credit2 = await asyncio.wait_for(
                    call_agent(
                        agent_name=f"{skill_name}",
                        system=system,
                        user=retry_user,
                        output_schema=_SkillOutput,
                        current_tokens=tokens_used,
                    ),
                    timeout=float(timeout),
                )
                output_raw = result2.to_dict() if hasattr(result2, "to_dict") else output_raw
                if hasattr(credit2, "input_tokens"):
                    tokens_used += credit2.input_tokens + credit2.output_tokens
                eval_score, eval_passed, eval_issues = self._check_evals(
                    skill_meta, input_data, output_raw
                )
            except Exception as exc:
                logger.warning("skill_retry_failed", skill=skill_name, error=str(exc))

        latency_ms = (time.monotonic() - t0) * 1000

        # ── Write example if quality passes ───────────────────────────────
        if eval_score >= SKILL_EXAMPLE_WRITE_THRESHOLD:
            asyncio.create_task(
                self._write_example_async(
                    skill_name=skill_name,
                    skill_version=skill_version,
                    eval_score=eval_score,
                    input_data=input_data,
                    output=output_raw,
                    ctx=ctx,
                )
            )

        logger.info(
            "skill_executed",
            skill=skill_name,
            version=skill_version,
            eval_score=round(eval_score, 3),
            eval_passed=eval_passed,
            retried=retried,
            latency_ms=round(latency_ms),
            tokens=tokens_used,
        )

        # Langfuse generation — shows each skill call in the pipeline trace
        try:
            _get_tracer().log_generation(
                name=f"skill:{skill_name}",
                model=model_used,
                input={"skill": skill_name, "version": skill_version},
                output={
                    "eval_score":  round(eval_score, 3),
                    "eval_passed": eval_passed,
                    "retried":     retried,
                    "output_keys": list(output_raw.keys()) if output_raw else [],
                },
                usage={"input": 0, "output": tokens_used, "unit": "TOKENS"},
            )
        except Exception:
            pass

        return SkillResult(
            output=output_raw,
            eval_score=eval_score,
            eval_passed=eval_passed,
            eval_issues=eval_issues,
            retried=retried,
            skill_name=skill_name,
            skill_version=skill_version,
            model=model_used,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            reasoning_trace={
                "eval_score": eval_score,
                "eval_issues": eval_issues,
                "model": model_used,
                "retried": retried,
                "schema_version": 1,
            },
        )

    # ── System prompt assembly ─────────────────────────────────────────────

    async def _build_system(self, skill_meta: dict, input_data: dict) -> str:
        """Assemble system prompt: SKILL.md body + reference files + few-shot examples."""
        parts: list[str] = [skill_meta.get("_body", "")]

        # Reference files in skill's references/ subdirectory
        skill_dir = Path(skill_meta.get("_dir", "."))
        refs_dir = skill_dir / "references"
        if refs_dir.is_dir():
            ref_sections: list[str] = []
            for ref_file in sorted(refs_dir.glob("*.md")):
                try:
                    content = ref_file.read_text(encoding="utf-8")
                    ref_sections.append(f"\n## Reference: {ref_file.stem}\n\n{content}")
                except Exception:
                    pass
            if ref_sections:
                parts.append("\n\n---\n" + "\n".join(ref_sections))

        # Few-shot examples from DB
        examples = await self._fetch_examples(skill_meta["name"])
        if examples:
            ex_block = "\n\n---\n## High-Quality Examples from Production\n\n"
            for i, ex in enumerate(examples[:3], 1):
                ex_block += (
                    f"### Example {i} (quality score: {ex.get('eval_score', 0):.2f})\n"
                    f"**Input:**\n```json\n{json.dumps(ex['input_json'], indent=2, ensure_ascii=False)}\n```\n"
                    f"**Output:**\n```json\n{json.dumps(ex['output_json'], indent=2, ensure_ascii=False)}\n```\n\n"
                )
            parts.append(ex_block)

        return "\n".join(parts)

    async def _fetch_examples(self, skill_name: str) -> list[dict]:
        """Fetch top examples from skill_examples table. Returns [] gracefully on any error."""
        try:
            from crystalos.lib import db
            from crystalos.lib.constants import SKILL_EVAL_PASS_THRESHOLD
            rows = await db.execute_query(
                """SELECT input_json, output_json, eval_score
                   FROM skill_examples
                   WHERE skill_name = %s AND eval_score >= %s
                   ORDER BY eval_score DESC, created_at DESC
                   LIMIT 3""",
                (skill_name, SKILL_EVAL_PASS_THRESHOLD),
            )
            if not rows:
                return []
            return [
                {"input_json": r[0], "output_json": r[1], "eval_score": float(r[2])}
                for r in rows
            ]
        except Exception:
            return []

    # ── Eval engine ───────────────────────────────────────────────────────

    def _check_evals(
        self,
        skill_meta: dict,
        input_data: dict,
        output: dict,
    ) -> tuple[float, bool, list[str]]:
        """Parse EVALS.md and check all criteria. Returns (score, passed, issues)."""
        from crystalos.lib.constants import SKILL_EVAL_PASS_THRESHOLD

        skill_dir = Path(skill_meta.get("_dir", "."))
        evals_path = skill_dir / skill_meta.get("evals", "EVALS.md")

        if not evals_path.exists():
            return 0.85, True, []

        try:
            criteria = self._parse_evals_md(evals_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.debug("evals_parse_error", error=str(exc))
            return 0.75, True, []

        if not criteria:
            return 0.75, True, []

        issues: list[str] = []
        weighted_sum = 0.0
        weight_total = 0.0
        must_pass_failed = False

        for crit in criteria:
            crit_id = crit["id"]
            threshold = crit["threshold"]
            weight = float(crit["weight"])
            desc = crit["description"].lower()

            score = self._eval_criterion(desc, input_data, output)

            if threshold == "must pass":
                if score < 1.0:
                    issues.append(f"{crit_id}: FAILED — {crit['description'][:80]}")
                    must_pass_failed = True
            else:
                try:
                    thresh_f = float(str(threshold).lstrip(">= ").strip())
                except ValueError:
                    thresh_f = SKILL_EVAL_PASS_THRESHOLD
                weighted_sum += score * weight
                weight_total += weight
                if score < thresh_f:
                    issues.append(
                        f"{crit_id}: score={score:.2f} < {thresh_f} — {crit['description'][:60]}"
                    )

        if must_pass_failed:
            return 0.0, False, issues

        if weight_total == 0:
            return 0.75, True, issues

        final_score = weighted_sum / weight_total
        passed = (final_score >= SKILL_EVAL_PASS_THRESHOLD) and not issues
        return round(final_score, 3), passed, issues

    def _parse_evals_md(self, text: str) -> list[dict]:
        """Extract criteria rows from EVALS.md markdown table."""
        criteria: list[dict] = []
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 4 and re.match(r"E\d+", parts[0]):
                try:
                    criteria.append({
                        "id": parts[0],
                        "description": parts[1],
                        "weight": float(parts[2]),
                        "threshold": parts[3].lower().strip(),
                    })
                except (ValueError, IndexError):
                    pass
        return criteria

    def _eval_criterion(self, description: str, input_data: dict, output: dict) -> float:
        """Heuristic score (0.0–1.0) for a single criterion based on its description."""
        # Valid JSON — always 1.0 if we got here (output is already parsed)
        if "valid json" in description:
            return 1.0 if isinstance(output, dict) and not output.get("error") else 0.0

        # Required fields present and non-empty
        if "required fields" in description or "non-empty" in description:
            non_empty = sum(1 for v in output.values() if v not in (None, "", [], {}))
            return min(1.0, non_empty / max(len(output), 1))

        # Count range check: "key_findings count is 3-5"
        m = re.search(r"(\w+(?:_\w+)*)\s+count\s+is\s+(\d+)-(\d+)", description)
        if m:
            field, lo, hi = m.group(1), int(m.group(2)), int(m.group(3))
            val = output.get(field)
            if isinstance(val, list):
                return 1.0 if lo <= len(val) <= hi else max(0.3, 1.0 - abs(len(val) - lo) * 0.2)

        # Actionability check
        if "actionable" in description or "specific action" in description:
            actions = (
                output.get("recommended_actions")
                or output.get("actions")
                or output.get("action_items")
                or []
            )
            if actions:
                long_enough = sum(1 for a in actions if len(str(a).split()) >= 5)
                return long_enough / len(actions)
            return 0.5

        # Citation / verbatim check
        if "verbatim" in description or "supporting" in description:
            findings = output.get("key_findings") or output.get("findings") or []
            if findings:
                cited = sum(
                    1 for f in findings
                    if isinstance(f, dict) and (f.get("supporting_verbatim") or f.get("citation"))
                )
                return cited / len(findings)
            return 0.7

        # Sentiment direction check
        if "sentiment" in description and "contradict" in description:
            return 0.85  # Hard to check deterministically — soft pass

        # Default: soft pass
        return 0.8

    async def _write_example_async(
        self,
        skill_name: str,
        skill_version: str,
        eval_score: float,
        input_data: dict,
        output: dict,
        ctx: dict,
    ) -> None:
        """Write a passing example to skill_examples. Non-blocking, silently fails."""
        try:
            from crystalos.lib import db
            from crystalos.lib.constants import SKILL_EXAMPLE_MAX_PER_SKILL
            await db.execute_query(
                """INSERT INTO skill_examples
                   (skill_name, skill_version, eval_score, input_json, output_json, org_id)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    skill_name,
                    skill_version,
                    round(eval_score, 4),
                    json.dumps(input_data, ensure_ascii=False),
                    json.dumps(output, ensure_ascii=False),
                    ctx.get("org_id"),
                ),
            )
            await db.execute_query(
                "SELECT prune_skill_examples(%s, %s)",
                (skill_name, SKILL_EXAMPLE_MAX_PER_SKILL),
            )
        except Exception as exc:
            logger.debug("skill_example_write_failed", skill=skill_name, error=str(exc))
