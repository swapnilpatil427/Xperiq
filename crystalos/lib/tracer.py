"""CrystalOS Distributed Tracer — Langfuse integration with graceful no-op fallback.

When LANGFUSE_PUBLIC_KEY is not set (local dev, CI), all methods are no-ops.
When set, traces are sent to Langfuse for distributed pipeline observability.

PII scrubbing is applied to all inputs before they leave this process.

Usage:
    tracer = get_tracer()
    with tracer.trace("pipeline_run", input={"survey_id": ...}) as t:
        with t.span("node_ingest"):
            ...
    tracer.flush()  # call on app shutdown
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Generator

from crystalos.lib.logger import logger
from crystalos.lib.pii_scrubber import scrub_dict

_LANGFUSE_PUBLIC_KEY  = os.getenv("LANGFUSE_PUBLIC_KEY", "")
_LANGFUSE_SECRET_KEY  = os.getenv("LANGFUSE_SECRET_KEY", "")
_LANGFUSE_HOST        = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
_ENABLED              = bool(_LANGFUSE_PUBLIC_KEY and _LANGFUSE_SECRET_KEY)

_langfuse_client: Any = None

if _ENABLED:
    try:
        from langfuse import Langfuse  # type: ignore[import-untyped]
        _langfuse_client = Langfuse(
            public_key=_LANGFUSE_PUBLIC_KEY,
            secret_key=_LANGFUSE_SECRET_KEY,
            host=_LANGFUSE_HOST,
        )
        logger.info("langfuse_enabled", host=_LANGFUSE_HOST)
    except ImportError:
        logger.info("langfuse_not_installed", note="pip install langfuse to enable tracing")
        _ENABLED = False
    except Exception as exc:
        logger.warning("langfuse_init_failed", error=str(exc))
        _ENABLED = False


class SpanHandle:
    """Context manager for a Langfuse span (or no-op)."""

    def __init__(self, span: Any = None) -> None:
        self._span = span

    def __enter__(self) -> "SpanHandle":
        return self

    def __exit__(self, *args: Any) -> None:
        if self._span is not None:
            try:
                self._span.end()
            except Exception:
                pass

    def log_output(self, output: Any) -> None:
        if self._span is not None:
            try:
                self._span.update(output=scrub_dict(output) if isinstance(output, (dict, list)) else str(output))
            except Exception:
                pass

    def log_error(self, error: str) -> None:
        if self._span is not None:
            try:
                self._span.update(level="ERROR", status_message=error[:500])
            except Exception:
                pass


class TraceHandle:
    """Context manager for a Langfuse trace (or no-op)."""

    def __init__(self, trace: Any = None) -> None:
        self._trace = trace

    def __enter__(self) -> "TraceHandle":
        return self

    def __exit__(self, *args: Any) -> None:
        if self._trace is not None:
            try:
                self._trace.update(status="completed" if not args[1] else "error")
            except Exception:
                pass

    @contextmanager
    def span(self, name: str, input: Any = None, **kwargs: Any) -> Generator[SpanHandle, None, None]:
        """Create a child span within this trace."""
        if self._trace is None:
            yield SpanHandle()
            return
        try:
            span_input = scrub_dict(input) if isinstance(input, (dict, list)) else input
            span = self._trace.span(name=name, input=span_input, **kwargs)
            handle = SpanHandle(span)
            yield handle
        except Exception:
            yield SpanHandle()


class Tracer:
    """Main tracer class. Singleton per process."""

    @contextmanager
    def trace(
        self, name: str, input: Any = None, metadata: dict | None = None, **kwargs: Any
    ) -> Generator[TraceHandle, None, None]:
        """Create a top-level Langfuse trace (or no-op context)."""
        if not _ENABLED or _langfuse_client is None:
            yield TraceHandle()
            return
        try:
            trace_input = scrub_dict(input) if isinstance(input, (dict, list)) else input
            trace = _langfuse_client.trace(
                name=name,
                input=trace_input,
                metadata=scrub_dict(metadata or {}),
                **kwargs,
            )
            yield TraceHandle(trace)
        except Exception as exc:
            logger.debug("langfuse_trace_error", error=str(exc))
            yield TraceHandle()

    @contextmanager
    def span(self, name: str, input: Any = None, **kwargs: Any) -> Generator[SpanHandle, None, None]:
        """Create a standalone span (without a parent trace context)."""
        if not _ENABLED or _langfuse_client is None:
            yield SpanHandle()
            return
        try:
            span_input = scrub_dict(input) if isinstance(input, (dict, list)) else input
            span = _langfuse_client.span(name=name, input=span_input, **kwargs)
            yield SpanHandle(span)
        except Exception as exc:
            logger.debug("langfuse_span_error", error=str(exc))
            yield SpanHandle()

    def log_generation(
        self,
        name: str,
        model: str,
        input: Any,
        output: Any,
        usage: dict | None = None,
        trace_id: str | None = None,
    ) -> None:
        """Log a single LLM generation event. No-op when Langfuse disabled."""
        if not _ENABLED or _langfuse_client is None:
            return
        try:
            kwargs: dict = {"name": name, "model": model}
            if isinstance(input, (dict, list)):
                kwargs["input"] = scrub_dict(input)
            else:
                kwargs["input"] = str(input)[:2000]
            if isinstance(output, (dict, list)):
                kwargs["output"] = scrub_dict(output)
            else:
                kwargs["output"] = str(output)[:2000]
            if usage:
                kwargs["usage"] = usage
            if trace_id:
                kwargs["trace_id"] = trace_id
            _langfuse_client.generation(**kwargs)
        except Exception as exc:
            logger.debug("langfuse_generation_error", error=str(exc))

    def flush(self) -> None:
        """Flush pending trace events. Call on app shutdown."""
        if _ENABLED and _langfuse_client is not None:
            try:
                _langfuse_client.flush()
            except Exception as exc:
                logger.debug("langfuse_flush_error", error=str(exc))


_tracer: Tracer | None = None


def get_tracer() -> Tracer:
    global _tracer
    if _tracer is None:
        _tracer = Tracer()
    return _tracer
