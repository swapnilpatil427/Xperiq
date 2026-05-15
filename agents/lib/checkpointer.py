"""LangGraph checkpoint persistence using AsyncPostgresSaver.

Uses the SAME Postgres instance as the Node.js backend for simplicity.
LangGraph creates its own checkpoint tables (checkpoints, checkpoint_blobs,
checkpoint_migrations) — separate from the Experient application tables.

IMPORTANT: Never use InMemorySaver outside of unit tests. Pod restarts would
silently discard mid-run state, causing partial survey creations.
"""
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

_DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/experient",
)

# Convert asyncpg-style URL to psycopg2-style if needed
# LangGraph's AsyncPostgresSaver uses psycopg (v3) — ensure correct driver prefix
def _normalise_db_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


_CONN_STRING = _normalise_db_url(_DB_URL)


@asynccontextmanager
async def get_checkpointer() -> AsyncGenerator[AsyncPostgresSaver, None]:
    """
    Context manager that yields a ready AsyncPostgresSaver.

    Runs setup() on first use to create LangGraph's checkpoint tables.
    Safe to call setup() multiple times — it is idempotent.
    """
    async with AsyncPostgresSaver.from_conn_string(_CONN_STRING) as checkpointer:
        await checkpointer.setup()
        yield checkpointer
