"""In-process task registry for active survey creation runs.

Maps run_id → asyncio.Task so in-flight LangGraph graphs can be
interrupted when the user requests cancellation.

Safe for single-process deploys (the default uvicorn setup). For
multi-worker or clustered deploys a distributed signal (e.g. Redis
pub/sub) would be needed — that is out of scope for now.
"""
from __future__ import annotations

import asyncio

_tasks: dict[str, asyncio.Task] = {}


def register(run_id: str, task: asyncio.Task) -> None:
    _tasks[run_id] = task


def deregister(run_id: str) -> None:
    _tasks.pop(run_id, None)


def cancel(run_id: str) -> bool:
    """Cancel the asyncio task for run_id.

    Returns True if a live task was found and cancelled, False if the
    run was already complete or not found (e.g. different worker).
    """
    task = _tasks.pop(run_id, None)
    if task is not None and not task.done():
        task.cancel()
        return True
    return False
