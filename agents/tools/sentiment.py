"""Sentiment utilities — LLM-assisted ABSA on open-text answers."""
from __future__ import annotations
from typing import Any
import json
import re
import structlog

logger = structlog.get_logger()

EMOTION_LABELS = ["joy", "sadness", "anger", "fear", "surprise", "disgust", "neutral", "frustration", "trust", "anticipation"]

def detect_dominant_emotion(text: str) -> str:
    """Heuristic keyword-based emotion detection for offline use."""
    text_lower = text.lower()
    patterns = {
        "frustration": ["frustrat", "annoy", "irritat", "stuck", "loop", "again", "still"],
        "anger":       ["angry", "furious", "rage", "unacceptable", "terrible", "worst"],
        "sadness":     ["disappoint", "sad", "unfortunate", "let down"],
        "joy":         ["great", "excellent", "amazing", "love", "fantastic", "perfect"],
        "trust":       ["reliable", "trustworthy", "dependable", "consistent"],
    }
    for emotion, keywords in patterns.items():
        if any(kw in text_lower for kw in keywords):
            return emotion
    return "neutral"

def score_sentiment(text: str) -> float:
    """Heuristic sentiment score -1.0 to 1.0."""
    positive = ["good", "great", "excellent", "amazing", "love", "perfect", "fast", "easy", "helpful"]
    negative = ["bad", "terrible", "poor", "slow", "difficult", "broken", "frustrat", "error", "fail", "awful"]
    t = text.lower()
    pos = sum(1 for w in positive if w in t)
    neg = sum(1 for w in negative if w in t)
    total = pos + neg
    if total == 0:
        return 0.0
    return round((pos - neg) / total, 2)


async def run_absa_llm(texts: list[dict], llm_func) -> list[dict]:
    """
    Run Aspect-Based Sentiment Analysis via LLM in batches.
    texts: [{response_id, text, question_id}]
    Returns: [{response_id, aspects: [{aspect, sentiment, score}], dominant_emotion}]
    """
    results = []
    batch_size = 10
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        numbered = "\n".join(f"{j+1}. {t['text'][:200]}" for j, t in enumerate(batch))
        prompt = f"""Analyze these survey responses for aspect-based sentiment.
For each numbered response, identify the main aspect mentioned and its sentiment.

Responses:
{numbered}

Return a JSON array with {len(batch)} objects:
[{{"i": 1, "aspect": "support response time", "sentiment": "negative", "score": -0.8}}, ...]
Return ONLY valid JSON array, no explanation."""
        try:
            raw = await llm_func(prompt)
            # Strip Qwen 3 <think>...</think> blocks and markdown fences
            cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
            cleaned = cleaned.lstrip("```json").lstrip("```").rstrip("```").strip()
            parsed = json.loads(cleaned)
            for j, item in enumerate(parsed[:len(batch)]):
                t = batch[j]
                results.append({
                    "response_id": t["response_id"],
                    "question_id": t["question_id"],
                    "text":        t["text"],
                    "aspect":      item.get("aspect", "general"),
                    "sentiment":   item.get("sentiment", "neutral"),
                    "score":       float(item.get("score", 0.0)),
                    "emotion":     detect_dominant_emotion(t["text"]),
                })
        except Exception as exc:
            logger.warning("absa_batch_failed", error=str(exc))
            # Fallback to heuristic
            for t in batch:
                results.append({
                    "response_id": t["response_id"],
                    "question_id": t["question_id"],
                    "text":        t["text"],
                    "aspect":      "general",
                    "sentiment":   "neutral",
                    "score":       score_sentiment(t["text"]),
                    "emotion":     detect_dominant_emotion(t["text"]),
                })
    return results
