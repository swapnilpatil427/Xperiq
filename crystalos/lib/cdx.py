"""CrystalOS Developer Experience (CDX) — test endpoint and admin skill management."""
from __future__ import annotations

import math
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from crystalos.lib import db
from crystalos.lib.constants import AGENTS_ENV
from crystalos.lib.logger import logger
from crystalos.lib.security import require_internal_key
from crystalos.lib.skill_registry import get_registry
from crystalos.lib.skill_runtime import SkillRuntime

router = APIRouter(tags=["cdx"])


# ── Request / Response models ─────────────────────────────────────────────────

class CdxTestRequest(BaseModel):
    query: str
    skill_name: str | None = None
    org_id: str = "dev-org-001"
    brand_id: str | None = None


class CdxTestResponse(BaseModel):
    routing: list[dict]         # [{name, score}]
    skill_used: str
    output: str
    eval_score: float | None
    eval_detail: list[dict]     # [{criterion, score, method}]
    latency_ms: int
    tokens_in: int
    tokens_out: int


# ── Statistical helpers ───────────────────────────────────────────────────────

def _norm_cdf(x: float) -> float:
    """Normal CDF approximation (Abramowitz and Stegun)."""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _check_significance(
    baseline_passes: int,
    baseline_total: int,
    challenger_passes: int,
    challenger_total: int,
    alpha: float = 0.05,
) -> tuple[bool, float]:
    """Two-proportion z-test. Returns (is_significant, p_value)."""
    p1 = baseline_passes / baseline_total if baseline_total else 0.0
    p2 = challenger_passes / challenger_total if challenger_total else 0.0
    if baseline_total == 0 or challenger_total == 0:
        return False, 1.0
    p_pool = (baseline_passes + challenger_passes) / (baseline_total + challenger_total)
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / baseline_total + 1 / challenger_total))
    if se == 0:
        return False, 1.0
    z = (p2 - p1) / se
    p_value = 2 * (1 - _norm_cdf(abs(z)))
    return p_value < alpha and p2 > p1, p_value


# ── CDX Test endpoint ─────────────────────────────────────────────────────────

@router.post("/api/cdx/test", response_model=CdxTestResponse)
async def cdx_test_skill(
    body: CdxTestRequest,
    _: None = Depends(require_internal_key),
) -> CdxTestResponse:
    """Dev-only endpoint: test skill routing and execution with full debug output."""
    if AGENTS_ENV == "production":
        raise HTTPException(status_code=403, detail="CDX test endpoint disabled in production")

    t0 = time.monotonic()

    registry = get_registry()

    # 1. Routing — find top-5 candidates
    routing = registry.find_with_scores(body.query, top_k=5)

    # 2. Pick skill
    if body.skill_name:
        skill_name = body.skill_name
    elif routing:
        skill_name = routing[0]["name"]
    else:
        raise HTTPException(status_code=404, detail="No matching skill found for query")

    skill_meta = registry.get_skill_meta(skill_name)
    if not skill_meta:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

    # 3. Execute skill
    ctx = {"org_id": body.org_id, "brand_id": body.brand_id}
    runtime = SkillRuntime()

    import json
    try:
        result = await runtime.execute(
            skill_name=skill_name,
            skill_meta=skill_meta,
            input_data={"query": body.query, "org_id": body.org_id},
            ctx=ctx,
            write_example=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Skill execution failed: {exc}")

    latency_ms = int((time.monotonic() - t0) * 1000)

    # 4. Build eval detail from issues
    eval_detail = [
        {"criterion": issue.split(":")[0], "score": 0.0, "method": "heuristic"}
        for issue in (result.eval_issues or [])
    ]

    tokens_in = 0
    tokens_out = 0
    if result.tokens_used:
        # approximate split
        tokens_in = result.tokens_used // 2
        tokens_out = result.tokens_used - tokens_in

    return CdxTestResponse(
        routing=routing,
        skill_used=skill_name,
        output=json.dumps(result.output, ensure_ascii=False)[:2000],
        eval_score=round(result.eval_score, 3) if result.eval_score is not None else None,
        eval_detail=eval_detail,
        latency_ms=latency_ms,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )


# ── Admin: skill management endpoints ─────────────────────────────────────────

def _compute_health(avg_score: float | None, neg_rate: float) -> str:
    if avg_score is None:
        return "healthy"
    if avg_score >= 0.75 and neg_rate < 0.20:
        return "healthy"
    if avg_score >= 0.60 or neg_rate <= 0.30:
        return "attention"
    return "failing"


@router.get("/api/admin/skills")
async def list_admin_skills(_: None = Depends(require_internal_key)) -> list:
    """List all skills — returns SkillListItem[] matching the frontend adminApi shape."""
    registry = get_registry()
    skills_meta = registry.list_skills()

    # Pull per-skill quality metrics in one query (skill_quality_metrics aggregated nightly)
    quality_map: dict[str, dict] = {}
    try:
        rows = await db.execute_query(
            """SELECT skill_name,
                      COALESCE(SUM(total_runs), 0) as queries_30d,
                      AVG(avg_eval_score)::decimal(4,3) as avg_eval_score,
                      CASE WHEN SUM(total_runs) > 0
                           THEN (SUM(negative_signals)::float / SUM(total_runs))
                           ELSE 0 END as neg_rate,
                      COALESCE(AVG(p50_latency_ms), 0) as p50_ms
               FROM skill_quality_metrics
               GROUP BY skill_name""",
            (),
        )
        for r in rows:
            quality_map[str(r[0])] = {
                "queries_30d": int(r[1]),
                "avg_eval_score": float(r[2]) if r[2] else None,
                "neg_rate": float(r[3]) if r[3] else 0.0,
                "p50_ms": int(r[4]) if r[4] else 0,
            }
    except Exception:
        pass

    result = []
    for meta in skills_meta:
        name = meta["name"]
        q = quality_map.get(name, {})
        avg_score = q.get("avg_eval_score")
        neg_rate  = q.get("neg_rate", 0.0)
        result.append({
            "name":           name,
            "version":        meta.get("version", "1.0.0"),
            "source":         "global" if meta.get("shared", True) else "brand",
            "queries_30d":    q.get("queries_30d", 0),
            "avg_eval_score": avg_score if avg_score is not None else 0.85,
            "neg_rate":       neg_rate,
            "p50_ms":         q.get("p50_ms", 0),
            "health":         _compute_health(avg_score, neg_rate),
        })
    return result


@router.get("/api/admin/skills/{name}")
async def get_admin_skill(name: str, _: None = Depends(require_internal_key)) -> dict:
    """Skill detail — returns SkillDetail matching the frontend adminApi shape."""
    registry = get_registry()
    meta = registry.get_skill_meta(name)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")

    # Quality trend: last 30 days by day from crystal_turn_events (fall back to skill_examples)
    quality_trend: list[dict] = []
    try:
        rows = await db.execute_query(
            """SELECT date_trunc('day', created_at)::date as day,
                      COUNT(*) as query_count,
                      AVG(eval_score)::decimal(4,3) as avg_eval_score
               FROM crystal_turn_events
               WHERE skill_name = %s
                 AND created_at > NOW() - INTERVAL '30 days'
               GROUP BY 1
               ORDER BY 1""",
            (name,),
        )
        quality_trend = [
            {
                "date": str(r[0]),
                "query_count": int(r[1]),
                "avg_eval_score": float(r[2]) if r[2] else 0.0,
            }
            for r in rows
        ]
    except Exception:
        pass

    # Top queries (last 7 days)
    top_queries: list[dict] = []
    try:
        rows = await db.execute_query(
            """SELECT query, eval_score, created_at
               FROM crystal_turn_events
               WHERE skill_name = %s
                 AND created_at > NOW() - INTERVAL '7 days'
               ORDER BY created_at DESC
               LIMIT 10""",
            (name,),
        )
        top_queries = [
            {
                "query":       str(r[0])[:200],
                "eval_score":  float(r[1]) if r[1] else 0.0,
                "occurred_at": r[2].isoformat() if r[2] else "",
            }
            for r in rows
        ]
    except Exception:
        pass

    # Eval criteria — parse from EVALS.md
    eval_criteria: list[dict] = []
    try:
        from pathlib import Path as _Path
        from crystalos.lib.skill_runtime import SkillRuntime as _SR, _is_structural_criterion
        skill_dir = _Path(meta.get("_dir", "."))
        evals_path = skill_dir / meta.get("evals", "EVALS.md")
        if evals_path.exists():
            rt = _SR()
            criteria = rt._parse_evals_md(evals_path.read_text(encoding="utf-8"))
            for c in criteria:
                desc = c.get("description", "")
                method = "structural" if _is_structural_criterion(desc) else "llm_judge"
                eval_criteria.append({
                    "name":   c.get("id", ""),
                    "score":  0.0,
                    "method": method,
                })
    except Exception:
        pass

    # Summary quality
    avg_score: float | None = None
    neg_rate = 0.0
    p50_ms = 0
    queries_30d = 0
    try:
        rows = await db.execute_query(
            """SELECT COALESCE(SUM(total_runs),0), AVG(avg_eval_score),
                      CASE WHEN SUM(total_runs)>0 THEN SUM(negative_signals)::float/SUM(total_runs) ELSE 0 END,
                      COALESCE(AVG(p50_latency_ms),0)
               FROM skill_quality_metrics WHERE skill_name = %s""",
            (name,),
        )
        if rows and rows[0][0]:
            queries_30d = int(rows[0][0])
            avg_score   = float(rows[0][1]) if rows[0][1] else None
            neg_rate    = float(rows[0][2]) if rows[0][2] else 0.0
            p50_ms      = int(rows[0][3]) if rows[0][3] else 0
    except Exception:
        pass

    from crystalos.lib.models import get_skill_model
    try:
        model_cfg = get_skill_model(name)
        model_id = model_cfg.model_id if hasattr(model_cfg, "model_id") else str(model_cfg)
    except Exception:
        model_id = "unknown"

    return {
        "name":           meta["name"],
        "version":        meta.get("version", "1.0.0"),
        "source":         "global" if meta.get("shared", True) else "brand",
        "model":          model_id,
        "health":         _compute_health(avg_score, neg_rate),
        "avg_eval_score": avg_score if avg_score is not None else 0.85,
        "neg_rate":       neg_rate,
        "p50_ms":         p50_ms,
        "queries_30d":    queries_30d,
        "quality_trend":  quality_trend,
        "top_queries":    top_queries,
        "eval_criteria":  eval_criteria,
    }


@router.get("/api/admin/skills/{name}/examples")
async def list_skill_examples(
    name: str,
    limit: int = 20,
    offset: int = 0,
    _: None = Depends(require_internal_key),
) -> dict:
    """Paginated example bank — returns SkillExamplesResponse shape."""
    import hashlib
    import json as _json

    try:
        rows = await db.execute_query(
            """SELECT id, input_json, output_json, eval_score, org_id, created_at
               FROM skill_examples
               WHERE skill_name = %s
               ORDER BY eval_score DESC, created_at DESC
               LIMIT %s OFFSET %s""",
            (name, limit, offset),
        )
        total_rows = await db.execute_query(
            "SELECT COUNT(*) FROM skill_examples WHERE skill_name = %s",
            (name,),
        )
        total = int(total_rows[0][0]) if total_rows else 0

        examples = []
        for r in rows:
            input_data = _json.loads(r[1]) if r[1] else {}
            output_data = _json.loads(r[2]) if r[2] else {}
            input_text = input_data.get("message", str(input_data))[:200]
            output_snippet = str(output_data.get("summary") or output_data.get("answer") or output_data)[:120]
            org_id = str(r[4]) if r[4] else ""
            org_id_hash = hashlib.sha256(org_id.encode()).hexdigest()[:12] if org_id else "anon"
            examples.append({
                "id":             str(r[0]),
                "input":          input_text,
                "output_snippet": output_snippet,
                "eval_score":     float(r[3]) if r[3] else 0.0,
                "org_id_hash":    org_id_hash,
                "created_at":     r[5].isoformat() if r[5] else "",
            })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"examples": examples, "total": total, "limit": limit, "offset": offset}


@router.delete("/api/admin/skills/{name}/examples")
async def delete_skill_examples(
    name: str,
    body: dict,
    _: None = Depends(require_internal_key),
) -> dict:
    """Purge examples by IDs."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=422, detail="ids required")
    try:
        deleted = 0
        for ex_id in ids:
            await db.execute_query(
                "DELETE FROM skill_examples WHERE id = %s AND skill_name = %s",
                (ex_id, name),
            )
            deleted += 1
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"deleted": deleted}


@router.get("/api/admin/skills/{name}/variants")
async def list_skill_variants(name: str, _: None = Depends(require_internal_key)) -> dict:
    """List variants — returns {variants: SkillVariant[]} matching the frontend adminApi shape."""
    registry = get_registry()
    raw_variants = registry.list_variants(name)
    if not raw_variants:
        raise HTTPException(status_code=404, detail=f"No variants found for skill '{name}'")

    # Fetch per-variant quality stats from crystal_turn_events
    stats: dict[str, dict] = {}
    try:
        rows = await db.execute_query(
            """SELECT skill_variant,
                      AVG(eval_score)::decimal(4,3) as pass_rate,
                      COUNT(*) FILTER (WHERE quality_signal = 'negative')::float /
                        NULLIF(COUNT(*), 0) as neg_rate,
                      MIN(created_at) as first_seen
               FROM crystal_turn_events
               WHERE skill_name = %s AND skill_variant IS NOT NULL
               GROUP BY skill_variant""",
            (name,),
        )
        for r in rows:
            stats[str(r[0])] = {
                "pass_rate":  float(r[1]) if r[1] else 0.0,
                "neg_rate":   float(r[2]) if r[2] else 0.0,
                "created_at": r[3].isoformat() if r[3] else "",
            }
    except Exception:
        pass

    # Determine which variant is currently at highest rollout_pct (= "current")
    max_rollout = max((v.get("rollout_pct", 0) for v in raw_variants), default=0)

    result = []
    for v in raw_variants:
        vname = v.get("variant", "default")
        s = stats.get(vname, {})
        rollout = v.get("rollout_pct", 100)
        result.append({
            "variant":     vname,
            "rollout_pct": rollout,
            "pass_rate":   s.get("pass_rate", 0.0),
            "neg_rate":    s.get("neg_rate", 0.0),
            "created_at":  s.get("created_at", ""),
            "is_current":  rollout == max_rollout,
        })
    return {"variants": result}


@router.post("/api/admin/skills/{name}/variants/{variant}/graduate")
async def graduate_variant(
    name: str,
    variant: str,
    _: None = Depends(require_internal_key),
) -> dict:
    """Graduate a challenger variant to 100% rollout after significance check."""
    registry = get_registry()
    variants_info = registry.list_variants(name)
    target = next((v for v in variants_info if v["variant"] == variant), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Variant '{variant}' not found for skill '{name}'")

    min_sample = target["min_sample_size"]
    baseline_variant = target["baseline"]

    # Fetch stats from DB
    try:
        rows = await db.execute_query(
            """SELECT skill_variant,
                      COUNT(*) as total,
                      COUNT(*) FILTER (WHERE quality_signal = 'positive') as passes
               FROM crystal_turn_events
               WHERE skill_name = %s AND skill_variant IN (%s, %s)
               GROUP BY skill_variant""",
            (name, variant, baseline_variant or "default"),
        )
        stats_map = {str(r[0]): {"total": int(r[1]), "passes": int(r[2])} for r in rows}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query stats: {exc}")

    challenger_stats = stats_map.get(variant, {"total": 0, "passes": 0})
    baseline_stats = stats_map.get(baseline_variant or "default", {"total": 0, "passes": 0})

    if challenger_stats["total"] < min_sample:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient sample size: {challenger_stats['total']} < {min_sample}",
        )

    significant, p_value = _check_significance(
        baseline_passes=baseline_stats["passes"],
        baseline_total=baseline_stats["total"],
        challenger_passes=challenger_stats["passes"],
        challenger_total=challenger_stats["total"],
    )

    if not significant:
        raise HTTPException(
            status_code=422,
            detail=f"Not statistically significant (p={p_value:.4f}). Cannot graduate.",
        )

    logger.info("skill_variant_graduated", skill=name, variant=variant, p_value=p_value)
    return {
        "graduated": True,
        "skill": name,
        "variant": variant,
        "p_value": round(p_value, 4),
        "message": f"Variant '{variant}' graduated. Set rollout_pct=100 in SKILL.md to apply.",
    }


@router.get("/api/admin/crystal/gaps")
async def list_capability_gaps(
    limit: int = 50,
    _: None = Depends(require_internal_key),
) -> dict:
    """Capability gap clusters — queries Crystal couldn't answer well."""
    try:
        # Try clustered view first (populated nightly by scheduler)
        rows = await db.execute_query(
            """SELECT id, representative_query, query_count,
                      best_match_skill, best_match_score, created_at, last_seen
               FROM capability_gap_clusters
               ORDER BY query_count DESC, last_seen DESC
               LIMIT %s""",
            (limit,),
        )
        if rows:
            gaps = [
                {
                    "id":                str(r[0]),
                    "query_pattern":     str(r[1]),
                    "count":             int(r[2]),
                    "best_match_skill":  r[3],
                    "best_match_score":  float(r[4]) if r[4] else None,
                    "first_seen":        r[5].isoformat() if r[5] else "",
                    "last_seen":         r[6].isoformat() if r[6] else "",
                }
                for r in rows
            ]
            return {"gaps": gaps, "total": len(gaps), "source": "clusters"}
    except Exception:
        pass

    # Fall back to raw capability gaps (no clusters yet)
    try:
        rows = await db.execute_query(
            """SELECT id, query, created_at
               FROM crystal_capability_gaps
               ORDER BY created_at DESC
               LIMIT %s""",
            (limit,),
        )
        gaps = [
            {
                "id":               str(r[0]),
                "query_pattern":    str(r[1])[:200],
                "count":            1,
                "best_match_skill": None,
                "best_match_score": None,
                "first_seen":       r[2].isoformat() if r[2] else "",
                "last_seen":        r[2].isoformat() if r[2] else "",
            }
            for r in rows
        ]
    except Exception:
        gaps = []

    return {"gaps": gaps, "total": len(gaps), "source": "raw"}


@router.post("/api/admin/skills/{name}/variants/{variant}/rollback")
async def rollback_variant(
    name: str,
    variant: str,
    _: None = Depends(require_internal_key),
) -> dict:
    """Rollback a challenger variant (set rollout to 0)."""
    logger.info("skill_variant_rollback", skill=name, variant=variant)
    return {
        "rolled_back": True,
        "skill": name,
        "variant": variant,
        "message": f"Variant '{variant}' rolled back. Set rollout_pct=0 in SKILL.md to apply.",
    }
