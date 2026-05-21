"""
Async-safe trace context propagated via Python contextvars.

GCP Cloud Logging / Cloud Trace compatible:
  - trace_id maps to the X-Cloud-Trace-Context trace identifier
  - run_id links every log line to the agent_runs row
  - org_id enables per-org log filtering in Cloud Log Explorer

Usage:
    set_trace_context(run_id="...", org_id="...")      # at pipeline start
    structlog.contextvars.bind_contextvars(**get_log_fields())  # inject into structlog
    clear_trace_context()                               # at pipeline end
"""
import contextvars
import os
import uuid

_run_id   = contextvars.ContextVar("run_id",   default="")
_org_id   = contextvars.ContextVar("org_id",   default="")
_trace_id = contextvars.ContextVar("trace_id", default="")


def set_trace_context(run_id: str, org_id: str, trace_id: str | None = None) -> None:
    _run_id.set(run_id)
    _org_id.set(org_id)
    _trace_id.set(trace_id or uuid.uuid4().hex)  # GCP trace ID: 32-char hex


def get_trace_context() -> dict:
    return {"run_id": _run_id.get(), "org_id": _org_id.get(), "trace_id": _trace_id.get()}


def clear_trace_context() -> None:
    _run_id.set("")
    _org_id.set("")
    _trace_id.set("")


def gcp_trace_field(project_id: str | None = None) -> str:
    """Return GCP-compatible trace resource name for Cloud Logging correlation.

    When GOOGLE_CLOUD_PROJECT is set (or project_id is provided), returns:
        projects/{project_id}/traces/{trace_id}
    which is the format Cloud Logging uses to correlate logs with Cloud Trace.

    Falls back to the raw trace_id when no project is configured (local dev).
    """
    tid = _trace_id.get()
    pid = project_id or os.getenv("GOOGLE_CLOUD_PROJECT", "")
    if pid and tid:
        return f"projects/{pid}/traces/{tid}"
    return tid
