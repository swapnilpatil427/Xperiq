"""Security layer for the agents service.

Enforces:
1. Internal API key — only the Node.js backend may call this service.
2. Tenant isolation — every handler receives org_id from the validated token,
   never from request body (prevents horizontal privilege escalation).
3. Input sanitisation — caps string lengths before they reach LLM prompts.
4. Thread ID generation — always encodes org_id so checkpoints are org-scoped.

The agents service is NOT internet-facing. It sits behind the Node.js backend
which authenticates the end user via Clerk. The internal key is an additional
defence-in-depth layer.
"""
import hashlib
import hmac
import os
import uuid

from fastapi import Header, HTTPException, status

# ── Internal API key ───────────────────────────────────────────────────────────
# Shared between Node.js backend (AGENTS_INTERNAL_KEY) and this service.
# For local dev the default keeps docker-compose zero-config.
# MUST be overridden in prod via environment variable.
_INTERNAL_KEY = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")


async def require_internal_key(
    x_internal_key: str = Header(..., alias="X-Internal-Key"),
) -> None:
    """FastAPI dependency — rejects requests without the correct internal key."""
    if not hmac.compare_digest(x_internal_key, _INTERNAL_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key",
        )


# ── Input sanitisation ─────────────────────────────────────────────────────────
MAX_INTENT_LEN       = 500    # chars — user-provided prompt
MAX_CONTEXT_STR_LEN  = 200    # chars — org context field values


def sanitise_intent(intent: str) -> str:
    """Cap length and strip leading/trailing whitespace."""
    return intent.strip()[:MAX_INTENT_LEN]


def sanitise_org_context(ctx: dict) -> dict:
    """Ensure no field is excessively long before it reaches LLM prompts."""
    return {
        k: str(v)[:MAX_CONTEXT_STR_LEN] if isinstance(v, str) else v
        for k, v in ctx.items()
    }


# ── Thread ID ──────────────────────────────────────────────────────────────────
def make_thread_id(org_id: str, session_id: str | None = None) -> str:
    """
    Encode org_id into the LangGraph thread_id.

    Format: <org_id>:<session_id>
    session_id defaults to a new UUID if not provided.

    This means LangGraph checkpoints are namespaced by org — no cross-org
    state bleed is possible because every checkpoint query includes thread_id
    which starts with the org's ID.
    """
    sid = session_id or str(uuid.uuid4())
    return f"{org_id}:{sid}"


def org_id_from_thread_id(thread_id: str) -> str:
    """Extract org_id from a thread_id. Raises ValueError on malformed input."""
    parts = thread_id.split(":", 1)
    if len(parts) != 2:
        raise ValueError(f"Malformed thread_id: {thread_id!r}")
    return parts[0]


def validate_thread_ownership(thread_id: str, org_id: str) -> None:
    """Raise 403 if the thread_id does not belong to org_id."""
    try:
        owner = org_id_from_thread_id(thread_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed thread_id")
    if owner != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Thread does not belong to this org",
        )


async def check_survey_access(survey_id: str, org_id: str, db_pool=None) -> dict | None:
    """Return survey row if survey_id belongs to org_id, None otherwise.

    Raises PermissionError if org mismatch detected (not just missing).
    """
    # Dev bypass
    if os.getenv("AGENTS_ENV", "production") == "dev" and org_id == "dev_org":
        return {"id": survey_id, "org_id": org_id, "status": "active"}

    try:
        from agents.lib import db
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT id, org_id, status, title, questions FROM surveys WHERE id = %s AND deleted_at IS NULL",
                    (survey_id,),
                )
                row = await cur.fetchone()
                if row is None:
                    return None
                cols = [desc[0] for desc in cur.description]
                survey = dict(zip(cols, row))
                if str(survey["org_id"]) != str(org_id):
                    raise PermissionError(f"Survey {survey_id} does not belong to org {org_id}")
                return survey
    except PermissionError:
        raise
    except Exception as exc:
        from agents.lib.logger import logger
        logger.error("check_survey_access_failed", survey_id=survey_id, error=str(exc))
        return None
