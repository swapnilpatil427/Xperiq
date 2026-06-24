"""Lightweight topic clustering using cosine similarity + LLM labeling."""
from __future__ import annotations
import math
from typing import Any
import structlog

logger = structlog.get_logger()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x ** 2 for x in a))
    mag_b = math.sqrt(sum(x ** 2 for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def cluster_texts(
    texts: list[dict],   # [{response_id, question_id, text, embedding?}]
    threshold: float = 0.75,
    min_cluster_size: int = 2,
) -> list[dict]:
    """
    Greedy cosine-similarity clustering.
    Items without embeddings are skipped (labeled 'unclustered').
    Returns list of clusters: {id, texts, centroid}.
    """
    embedded = [t for t in texts if t.get("embedding")]
    if not embedded:
        return []

    clusters: list[dict] = []
    assigned = set()

    for i, item in enumerate(embedded):
        if i in assigned:
            continue
        cluster_items = [item]
        assigned.add(i)
        for j, other in enumerate(embedded):
            if j in assigned or j == i:
                continue
            sim = cosine_similarity(item["embedding"], other["embedding"])
            if sim >= threshold:
                cluster_items.append(other)
                assigned.add(j)
        if len(cluster_items) >= min_cluster_size:
            # Centroid = mean of embeddings
            dim = len(cluster_items[0]["embedding"])
            centroid = [
                sum(it["embedding"][d] for it in cluster_items) / len(cluster_items)
                for d in range(dim)
            ]
            clusters.append({
                "id": f"c{len(clusters)+1}",
                "texts": cluster_items,
                "centroid": centroid,
                "size": len(cluster_items),
            })

    return sorted(clusters, key=lambda c: c["size"], reverse=True)
