"""
Checkpoint blob storage for Crystal intelligence reports.

Storage backend is selected by environment:
  dev / dev-paid  → local filesystem (always available, no credentials needed)
  staging / prod  → OCI Object Storage when configured; falls back to local with warning

OCI SDK (``oci`` package) is optional. If it is not installed or the required env vars
(CHECKPOINT_OCI_BUCKET, CHECKPOINT_OCI_NAMESPACE) are absent, the store silently uses
the local filesystem regardless of AGENTS_ENV.

Returned ``ref`` strings:
  local  →  absolute path, e.g.  /tmp/checkpoints/dev_org/survey-abc/ckpt-123.json
  OCI    →  object key,   e.g.  checkpoints/org-abc/survey-abc/ckpt-123.json

Callers must treat the ref as opaque and pass it back to read/url helpers.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from agents.lib.logger import logger

# ── Environment config ────────────────────────────────────────────────────────

AGENTS_ENV             = os.getenv("AGENTS_ENV", "dev")
CHECKPOINT_LOCAL_PATH  = os.getenv("CHECKPOINT_LOCAL_PATH", "/tmp/checkpoints")
CHECKPOINT_OCI_BUCKET    = os.getenv("CHECKPOINT_OCI_BUCKET", "")
CHECKPOINT_OCI_NAMESPACE = os.getenv("CHECKPOINT_OCI_NAMESPACE", "")
CHECKPOINT_OCI_REGION    = os.getenv("CHECKPOINT_OCI_REGION", "")

CURRENT_SCHEMA_VERSION = 1
_LOCAL_ENVS = {"dev", "dev-paid"}

# ── OCI availability detection ────────────────────────────────────────────────

_oci_object_client: Any = None
_OCI_AVAILABLE = False


def _init_oci() -> None:
    global _oci_object_client, _OCI_AVAILABLE

    if not CHECKPOINT_OCI_BUCKET or not CHECKPOINT_OCI_NAMESPACE:
        logger.info("checkpoint_store_oci_skipped", reason="bucket_or_namespace_not_set")
        return

    try:
        import oci  # noqa: F401 — optional dependency

        config = None

        # 1. Try file-based config (~/.oci/config) — works locally and for devs with OCI CLI
        try:
            config = oci.config.from_file()
            client = oci.object_storage.ObjectStorageClient(config)
            logger.info("checkpoint_store_oci_ready", auth="config_file", bucket=CHECKPOINT_OCI_BUCKET)
        except Exception:
            config = None

        # 2. Fall back to instance principal — works on OCI VMs in production
        if config is None:
            signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
            client = oci.object_storage.ObjectStorageClient(config={}, signer=signer)
            logger.info("checkpoint_store_oci_ready", auth="instance_principal", bucket=CHECKPOINT_OCI_BUCKET)

        _oci_object_client = client
        _OCI_AVAILABLE = True

    except ImportError:
        logger.info("checkpoint_store_oci_unavailable", reason="oci_sdk_not_installed")
    except Exception as exc:
        logger.warning("checkpoint_store_oci_init_failed", error=str(exc))


_init_oci()


# ── Backend selector ──────────────────────────────────────────────────────────

def _use_local() -> bool:
    """Return True when local filesystem should be used instead of OCI."""
    return AGENTS_ENV in _LOCAL_ENVS or not _OCI_AVAILABLE


# ── Path helpers ──────────────────────────────────────────────────────────────

def _local_blob_path(org_id: str, survey_id: str, checkpoint_id: str) -> Path:
    p = Path(CHECKPOINT_LOCAL_PATH) / org_id / survey_id
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{checkpoint_id}.json"


def _oci_object_key(org_id: str, survey_id: str, checkpoint_id: str) -> str:
    return f"checkpoints/{org_id}/{survey_id}/{checkpoint_id}.json"


def checkpoint_id_from_ref(ref: str) -> str:
    """Extract checkpoint_id (filename stem) from any ref format."""
    return Path(ref).stem


def is_local_ref(ref: str) -> bool:
    return ref.startswith("/") or ref.startswith(".")


# ── Write ─────────────────────────────────────────────────────────────────────

async def write_checkpoint_blob(
    blob: dict[str, Any],
    org_id: str,
    survey_id: str,
    checkpoint_id: str,
) -> str:
    """
    Write a checkpoint blob. Stamps schema_version if absent.

    Returns a storage ref (local path or OCI object key) to be stored in the DB.
    """
    if "schema_version" not in blob:
        blob = {"schema_version": CURRENT_SCHEMA_VERSION, **blob}

    content = json.dumps(blob, default=str).encode("utf-8")

    if _use_local():
        path = _local_blob_path(org_id, survey_id, checkpoint_id)
        await asyncio.to_thread(path.write_bytes, content)
        ref = str(path)
        logger.info("checkpoint_blob_written_local", ref=ref, bytes=len(content))
        return ref

    # OCI Object Storage
    key = _oci_object_key(org_id, survey_id, checkpoint_id)
    await asyncio.to_thread(
        _oci_object_client.put_object,
        CHECKPOINT_OCI_NAMESPACE,
        CHECKPOINT_OCI_BUCKET,
        key,
        content,
        content_type="application/json",
    )
    logger.info("checkpoint_blob_written_oci", key=key, bytes=len(content))
    return key


# ── Read ──────────────────────────────────────────────────────────────────────

async def read_checkpoint_blob(ref: str) -> dict[str, Any]:
    """
    Read a checkpoint blob and upgrade it to the current schema.
    ref is either a local path or an OCI object key.
    """
    if is_local_ref(ref):
        content = await asyncio.to_thread(Path(ref).read_bytes)
    else:
        resp = await asyncio.to_thread(
            _oci_object_client.get_object,
            CHECKPOINT_OCI_NAMESPACE,
            CHECKPOINT_OCI_BUCKET,
            ref,
        )
        content = resp.data.content

    blob = json.loads(content)
    return migrate_blob(blob)


# ── Read URL ──────────────────────────────────────────────────────────────────

async def get_checkpoint_read_url(ref: str, expiry_minutes: int = 15) -> str:
    """
    Return a URL the frontend can use to fetch the blob.

    dev / dev-paid  → returns the ref itself; the backend proxies it via
                      GET /internal/checkpoint-blob?ref=<ref>.
    staging / prod  → returns an OCI Pre-Authenticated Request (PAR) URL
                      valid for expiry_minutes.
    """
    if _use_local():
        # Backend serves the file directly — no signing needed
        return ref

    # OCI Pre-Authenticated Request
    import oci  # already available if we're on this path

    par_details = oci.object_storage.models.CreatePreauthenticatedRequestDetails(
        name=f"ckpt-read-{checkpoint_id_from_ref(ref)}-{int(datetime.now().timestamp())}",
        object_name=ref,
        access_type=oci.object_storage.models.CreatePreauthenticatedRequestDetails.ACCESS_TYPE_OBJECT_READ,
        time_expires=datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes),
    )
    resp = await asyncio.to_thread(
        _oci_object_client.create_preauthenticated_request,
        CHECKPOINT_OCI_NAMESPACE,
        CHECKPOINT_OCI_BUCKET,
        par_details,
    )
    # OCI returns a relative access_uri — combine with regional base URL
    return f"https://objectstorage.{CHECKPOINT_OCI_REGION}.oraclecloud.com{resp.data.access_uri}"


# ── Schema migration ──────────────────────────────────────────────────────────

def migrate_blob(blob: dict[str, Any]) -> dict[str, Any]:
    """Upgrade a blob to CURRENT_SCHEMA_VERSION. Idempotent on current-version blobs."""
    version = blob.get("schema_version", 0)
    if version == CURRENT_SCHEMA_VERSION:
        return blob
    if version < 1:
        blob = _migrate_v0_to_v1(blob)
    return blob


def _migrate_v0_to_v1(blob: dict[str, Any]) -> dict[str, Any]:
    """
    Add schema_version and normalise renamed keys.
    v0 blobs have all content fields but no schema_version stamp.
    """
    migrated: dict[str, Any] = {"schema_version": 1}

    # Normalise renamed keys (old_name → new_name)
    _renames = {
        "response_count_at_checkpoint": "response_count",
        "nps_at_checkpoint": "nps",
        "csat_at_checkpoint": "csat",
        "ces_at_checkpoint": "ces",
        "delta_from_prior": "delta",
        "created_at": "generated_at",
    }

    for old, new in _renames.items():
        if old in blob and new not in blob:
            migrated[new] = blob[old]

    # Copy all remaining keys, skipping ones we already handled
    _handled = set(_renames.keys()) | {"schema_version"}
    for k, v in blob.items():
        if k not in _handled and k not in migrated:
            migrated[k] = v

    # Ensure required v1 fields exist with safe defaults
    migrated.setdefault("survey_id", "")
    migrated.setdefault("org_id", "")
    migrated.setdefault("checkpoint_number", 0)
    migrated.setdefault("response_count", 0)
    migrated.setdefault("nps", None)
    migrated.setdefault("csat", None)
    migrated.setdefault("ces", None)
    migrated.setdefault("topics", [])
    migrated.setdefault("insights", [])
    migrated.setdefault("metrics", {})
    migrated.setdefault("delta", None)
    migrated.setdefault("generated_at", "")

    return migrated
