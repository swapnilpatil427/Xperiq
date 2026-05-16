"""OpenAI embeddings client with DB caching and heuristic fallback.

Uses text-embedding-3-small (1536 dims) via the OpenAI REST API directly (httpx).
Falls back to a bag-of-words heuristic when OPENAI_API_KEY is not set — good
enough for cosine-similarity clustering in tests and local dev.
"""
from __future__ import annotations

import math
import os
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIMS = 1536
_BATCH_SIZE = 100  # OpenAI supports up to 2048; use 100 for safety


# ── Heuristic fallback (no API key) ─────────────────────────────────────────

def _bow_vector(text: str, vocab: list[str]) -> list[float]:
    """Bag-of-words count vector for the given vocabulary, L2-normalised."""
    words = text.lower().split()
    word_counts = {}
    for w in words:
        word_counts[w] = word_counts.get(w, 0) + 1
    vec = [float(word_counts.get(v, 0)) for v in vocab]
    mag = math.sqrt(sum(x * x for x in vec))
    if mag == 0:
        return vec
    return [x / mag for x in vec]


def _build_bow_embeddings(texts: list[str]) -> list[list[float]]:
    """Build normalised BoW vectors from a shared vocabulary over all texts."""
    vocab_set: set[str] = set()
    for t in texts:
        vocab_set.update(t.lower().split())
    vocab = sorted(vocab_set)
    if not vocab:
        return [[0.0] * 10 for _ in texts]
    return [_bow_vector(t, vocab) for t in texts]


# ── OpenAI API call ──────────────────────────────────────────────────────────

async def _embed_via_api(texts: list[str]) -> list[list[float]]:
    """Call OpenAI embeddings endpoint. Returns vectors in input order."""
    headers = {
        "Authorization": f"Bearer {_OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": _EMBED_MODEL, "input": texts}
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            json=payload,
            headers=headers,
        )
    if not resp.is_success:
        raise RuntimeError(f"OpenAI embeddings API error {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    # data["data"] is sorted by index
    items = sorted(data["data"], key=lambda x: x["index"])
    return [item["embedding"] for item in items]


# ── Public API ───────────────────────────────────────────────────────────────

async def embed_texts(
    texts: list[str],
    org_id: str,
    survey_id: str,
) -> list[list[float]]:
    """Embed a list of strings.

    Uses OpenAI text-embedding-3-small when OPENAI_API_KEY is set;
    falls back to a heuristic BoW vector otherwise (for local dev / tests).
    Processes in batches of _BATCH_SIZE. Returns vectors in the same order
    as the input list.
    """
    if not texts:
        return []

    if not _OPENAI_API_KEY:
        logger.debug("embed_texts_heuristic_fallback", org_id=org_id, survey_id=survey_id, n=len(texts))
        return _build_bow_embeddings(texts)

    results: list[list[float]] = []
    for start in range(0, len(texts), _BATCH_SIZE):
        batch = texts[start : start + _BATCH_SIZE]
        vectors = await _embed_via_api(batch)
        results.extend(vectors)
        logger.debug(
            "embed_texts_batch",
            org_id=org_id,
            survey_id=survey_id,
            batch_start=start,
            batch_size=len(batch),
        )
    return results


async def get_or_create_embeddings(
    texts: list[dict],
    conn,
) -> list[dict]:
    """Return all texts with their embedding vectors, fetching from DB cache
    or calling embed_texts for misses.

    Each item in `texts` must have keys: response_id, question_id, text.
    Items without org_id/survey_id default to empty strings for the embed call.
    Returns the same list with an 'embedding' key added to each item.
    """
    if not texts:
        return []

    # Collect cache keys
    pair_to_idx: dict[tuple[str, str], list[int]] = {}
    for idx, item in enumerate(texts):
        key = (item["response_id"], item["question_id"])
        pair_to_idx.setdefault(key, []).append(idx)

    # Query existing embeddings
    response_ids = list({item["response_id"] for item in texts})
    question_ids = list({item["question_id"] for item in texts})

    cached: dict[tuple[str, str], list[float]] = {}
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT response_id, question_id, embedding
                   FROM response_embeddings
                   WHERE response_id = ANY(%s) AND question_id = ANY(%s)""",
                (response_ids, question_ids),
            )
            rows = await cur.fetchall()
            for row in rows:
                rid, qid, emb = row[0], row[1], row[2]
                # emb may be a string (pgvector returns '[...]' text) or list
                if isinstance(emb, str):
                    import json
                    emb = json.loads(emb.replace("(", "[").replace(")", "]"))
                cached[(rid, qid)] = emb
    except Exception as exc:
        logger.warning("get_or_create_embeddings_cache_query_failed", error=str(exc))
        try:
            await conn.rollback()
        except Exception:
            pass

    # Identify misses
    misses: list[dict] = []
    miss_indices: list[int] = []
    for idx, item in enumerate(texts):
        key = (item["response_id"], item["question_id"])
        if key not in cached:
            misses.append(item)
            miss_indices.append(idx)

    # Embed misses
    if misses:
        miss_texts = [m["text"] for m in misses]
        org_id = misses[0].get("org_id", "")
        survey_id = misses[0].get("survey_id", "")
        new_vectors = await embed_texts(miss_texts, org_id, survey_id)

        # Store new embeddings in DB
        for m, vec in zip(misses, new_vectors):
            try:
                import json as _json
                vec_str = "[" + ",".join(str(v) for v in vec) + "]"
                async with conn.cursor() as cur:
                    await cur.execute(
                        """INSERT INTO response_embeddings
                               (response_id, question_id, embedding)
                           VALUES (%s, %s, %s::vector)
                           ON CONFLICT DO NOTHING""",
                        (m["response_id"], m["question_id"], vec_str),
                    )
            except Exception as exc:
                logger.warning(
                    "get_or_create_embeddings_insert_failed",
                    response_id=m.get("response_id"),
                    error=str(exc),
                )
                try:
                    await conn.rollback()
                except Exception:
                    pass
            cached[(m["response_id"], m["question_id"])] = vec

    # Attach embeddings to all items (in-place copy)
    enriched = []
    for item in texts:
        key = (item["response_id"], item["question_id"])
        enriched.append({**item, "embedding": cached.get(key)})
    return enriched


async def similarity_search(
    embedding: list[float],
    survey_id: str,
    limit: int,
    conn,
) -> list[dict]:
    """Return the top-k most similar response embeddings for a given survey.

    Uses pgvector cosine distance operator <=> (requires pgvector extension).
    Returns list of dicts with keys: response_id, question_id, text, distance.
    """
    vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT re.response_id, re.question_id,
                          re.embedding <=> %s::vector AS distance
                   FROM response_embeddings re
                   JOIN responses r ON r.id = re.response_id
                   WHERE r.survey_id = %s
                   ORDER BY re.embedding <=> %s::vector
                   LIMIT %s""",
                (vec_str, survey_id, vec_str, limit),
            )
            rows = await cur.fetchall()
            cols = [desc[0] for desc in cur.description]
            return [dict(zip(cols, row)) for row in rows]
    except Exception as exc:
        logger.warning("similarity_search_failed", survey_id=survey_id, error=str(exc))
        return []
