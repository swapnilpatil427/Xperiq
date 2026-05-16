#!/usr/bin/env python3
"""Run insight generation for one or all active surveys.

Usage:
    python -m agents.skills.run_insights                   # run for all active surveys
    python -m agents.skills.run_insights --survey <id>     # run for specific survey
    python -m agents.skills.run_insights --status          # show last run status per survey
    python -m agents.skills.run_insights --dry-run         # show which surveys would be triggered
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

import dotenv
import httpx

dotenv.load_dotenv()
dotenv.load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

# ── Config ────────────────────────────────────────────────────────────────────

BACKEND_URL       = os.getenv("VITE_API_URL",       "http://localhost:5001")
AGENTS_URL        = os.getenv("AGENTS_URL",          "http://localhost:8001")
AGENTS_INTERNAL_KEY = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")
SKIP_AUTH         = os.getenv("SKIP_AUTH",           "true").lower() == "true"

# ── ANSI colors ───────────────────────────────────────────────────────────────

_COLOR = sys.stdout.isatty()

def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text

def green(t: str)  -> str: return _c("32",   t)
def yellow(t: str) -> str: return _c("33",   t)
def red(t: str)    -> str: return _c("31",   t)
def bold(t: str)   -> str: return _c("1",    t)
def dim(t: str)    -> str: return _c("2",    t)
def cyan(t: str)   -> str: return _c("36",   t)

# ── Helpers ───────────────────────────────────────────────────────────────────

async def _agents_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{AGENTS_URL}/health")
            return res.status_code == 200
    except Exception:
        return False


async def _get_active_surveys() -> list[dict]:
    """Fetch active surveys from the DB directly via psycopg."""
    try:
        import psycopg
        dsn = os.getenv("AGENTS_DB_DSN", "postgresql://postgres:postgres@localhost:5432/experient")
        async with await psycopg.AsyncConnection.connect(dsn) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT s.id, s.org_id, s.title, s.response_count,
                              ar.status as last_run_status,
                              ar.created_at as last_run_at,
                              ar.completed_at
                       FROM surveys s
                       LEFT JOIN LATERAL (
                           SELECT status, created_at, completed_at
                           FROM agent_runs
                           WHERE survey_id = s.id AND run_type = 'insight_generation'
                           ORDER BY created_at DESC LIMIT 1
                       ) ar ON true
                       WHERE s.status IN ('active', 'paused')
                         AND s.deleted_at IS NULL
                       ORDER BY s.response_count DESC NULLS LAST
                       LIMIT 100"""
                )
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row)) for row in await cur.fetchall()]
    except Exception as exc:
        print(red(f"  DB error: {exc}"))
        return []


async def _trigger_one(survey_id: str, org_id: str, dry_run: bool) -> dict:
    """Trigger insight generation for one survey via the agents service directly."""
    if dry_run:
        return {"status": "would_trigger", "survey_id": survey_id}

    try:
        import uuid
        import psycopg
        dsn = os.getenv("AGENTS_DB_DSN", "postgresql://postgres:postgres@localhost:5432/experient")
        run_id = str(uuid.uuid4())
        thread_id = f"insight:skill:{org_id}:{survey_id}"

        async with await psycopg.AsyncConnection.connect(dsn) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO agent_runs
                         (id, org_id, user_id, thread_id, run_type, status, intent, survey_id)
                       VALUES (%s, %s, 'skill', %s, 'insight_generation', 'running', 'insight:schedule', %s)
                       ON CONFLICT (thread_id) DO NOTHING
                       RETURNING id""",
                    (run_id, org_id, thread_id, survey_id),
                )
                row = await cur.fetchone()
                if not row:
                    return {"status": "already_running", "survey_id": survey_id}
                run_id = str(row[0])
            await conn.commit()

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{AGENTS_URL}/insights/generate",
                json={"survey_id": survey_id, "org_id": org_id, "run_id": run_id, "trigger": "schedule"},
                headers={"X-Internal-Key": AGENTS_INTERNAL_KEY},
            )
            if res.status_code in (200, 202):
                return {"status": "started", "run_id": run_id, "survey_id": survey_id}
            return {"status": "error", "code": res.status_code, "survey_id": survey_id}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "survey_id": survey_id}


def _fmt_time(ts) -> str:
    if not ts:
        return dim("never")
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return str(ts)
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta = now - ts
    minutes = int(delta.total_seconds() / 60)
    if minutes < 1:  return green("just now")
    if minutes < 60: return f"{minutes}m ago"
    if minutes < 1440: return f"{minutes // 60}h ago"
    return f"{minutes // 1440}d ago"


def _status_color(status: str | None) -> str:
    if not status:       return dim("—")
    if status == "completed": return green(status)
    if status == "running":   return cyan(status)
    if status == "failed":    return red(status)
    return yellow(status)


# ── Commands ──────────────────────────────────────────────────────────────────

async def cmd_status(args) -> None:
    surveys = await _get_active_surveys()
    if not surveys:
        print(yellow("No active surveys found."))
        return

    print(bold("\n  Survey Insight Status\n"))
    print(f"  {'SURVEY':<36}  {'RESPONSES':>9}  {'LAST RUN':>12}  STATUS")
    print("  " + "─" * 70)
    for s in surveys:
        title = (s["title"] or "Untitled")[:34]
        n     = str(s["response_count"] or 0)
        at    = _fmt_time(s["last_run_at"])
        st    = _status_color(s["last_run_status"])
        print(f"  {title:<36}  {n:>9}  {at:>12}  {st}")
    print()


async def cmd_run(args) -> None:
    healthy = await _agents_health()
    if not healthy:
        print(red(f"  ✗ Agents service not reachable at {AGENTS_URL}"))
        sys.exit(1)

    if args.survey:
        surveys = await _get_active_surveys()
        target = [s for s in surveys if s["id"] == args.survey or s["id"].startswith(args.survey)]
        if not target:
            print(red(f"  Survey '{args.survey}' not found or not active."))
            sys.exit(1)
    else:
        surveys = await _get_active_surveys()
        # Only trigger surveys without a recent completed run
        target = [
            s for s in surveys
            if s["last_run_status"] not in ("running",) and (s["response_count"] or 0) > 0
        ]

    if not target:
        print(yellow("  No surveys need insight generation right now."))
        return

    label = "Would trigger" if args.dry_run else "Triggering"
    print(bold(f"\n  {label} {len(target)} survey(s):\n"))

    for s in target:
        title = (s["title"] or "Untitled")[:50]
        result = await _trigger_one(str(s["id"]), s["org_id"], dry_run=args.dry_run)
        status = result.get("status", "unknown")

        if status == "started":
            print(f"  {green('✓')} {title}  {dim(result.get('run_id', '')[:12])}")
        elif status == "would_trigger":
            print(f"  {cyan('→')} {title}  {dim('(dry run)')}")
        elif status == "already_running":
            print(f"  {yellow('~')} {title}  {dim('already running')}")
        else:
            print(f"  {red('✗')} {title}  {dim(str(result))}")

    print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run insight generation for Experient surveys",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--survey",   "-s", metavar="ID",    help="Specific survey ID (prefix ok)")
    parser.add_argument("--status",   action="store_true",   help="Show last run status per survey")
    parser.add_argument("--dry-run",  action="store_true",   help="Show what would run without triggering")
    args = parser.parse_args()

    if args.status:
        asyncio.run(cmd_status(args))
    else:
        asyncio.run(cmd_run(args))


if __name__ == "__main__":
    main()
