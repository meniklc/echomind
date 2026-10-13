"""Lightweight local semantic embedding and vector similarity service."""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_EMBEDDING_MODEL: Any = None
_MODEL_INIT_ATTEMPTED = False
_EMBEDDING_CACHE: Dict[str, List[float]] = {}


def _get_model() -> Any:
    global _EMBEDDING_MODEL, _MODEL_INIT_ATTEMPTED
    if _EMBEDDING_MODEL is not None:
        return _EMBEDDING_MODEL
    if _MODEL_INIT_ATTEMPTED:
        return None

    _MODEL_INIT_ATTEMPTED = True
    try:
        from fastembed import TextEmbedding

        _EMBEDDING_MODEL = TextEmbedding(model_name=_MODEL_NAME)
        logger.info("Initialized local embedding model: %s", _MODEL_NAME)
        return _EMBEDDING_MODEL
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Fastembed unavailable or failed to initialize (%s). Falling back to pure-Python semantic vector similarity.",
            exc,
        )
        return None


def _fallback_vector(text: str) -> Dict[str, float]:
    """Compute character n-gram and word frequency vector for robust fallback."""
    words = text.lower().split()
    counts: Dict[str, float] = {}
    for word in words:
        counts[f"w:{word}"] = counts.get(f"w:{word}", 0.0) + 1.0
        # 3-char n-grams
        for i in range(len(word) - 2):
            ng = word[i : i + 3]
            counts[f"ng:{ng}"] = counts.get(f"ng:{ng}", 0.0) + 0.5

    # L2 normalize
    norm = math.sqrt(sum(v * v for v in counts.values()))
    if norm > 0:
        for k in counts:
            counts[k] /= norm
    return counts


def _fallback_cosine(vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
    common = set(vec1.keys()) & set(vec2.keys())
    return sum(vec1[k] * vec2[k] for k in common)


def cosine_similarity(v1: Sequence[float], v2: Sequence[float]) -> float:
    if len(v1) != len(v2):
        return 0.0
    dot = 0.0
    norm1 = 0.0
    norm2 = 0.0
    for a, b in zip(v1, v2):
        dot += a * b
        norm1 += a * a
        norm2 += b * b
    if norm1 <= 0.0 or norm2 <= 0.0:
        return 0.0
    return dot / (math.sqrt(norm1) * math.sqrt(norm2))


def get_embedding(text: str) -> Optional[List[float]]:
    clean = text.strip()
    if not clean:
        return None

    if clean in _EMBEDDING_CACHE:
        return _EMBEDDING_CACHE[clean]

    model = _get_model()
    if model is not None:
        try:
            embeddings = list(model.embed([clean]))
            if embeddings:
                vec = [float(x) for x in embeddings[0]]
                _EMBEDDING_CACHE[clean] = vec
                return vec
        except Exception as exc:  # noqa: BLE001
            logger.warning("Embedding generation failed for text '%s...': %s", clean[:30], exc)

    return None


def compute_semantic_similarity(query: str, document_text: str) -> float:
    """Compute semantic similarity using dense embeddings or lightweight fallback."""
    q_emb = get_embedding(query)
    d_emb = get_embedding(document_text)

    if q_emb is not None and d_emb is not None:
        sim = cosine_similarity(q_emb, d_emb)
        # Rescale [-1, 1] to [0, 1]
        return max(0.0, min(1.0, float(sim)))

    # Fallback to lexical-semantic character n-gram cosine
    v1 = _fallback_vector(query)
    v2 = _fallback_vector(document_text)
    return max(0.0, min(1.0, _fallback_cosine(v1, v2)))


def clear_embedding_cache() -> None:
    _EMBEDDING_CACHE.clear()
