"""Embedding abstraction + runtime vector search.

Uses local ONNX model via fastembed (default: intfloat/multilingual-e5-large).
E5-family models were trained with explicit `passage: ` / `query: ` prefixes;
using them properly adds measurable retrieval quality for free.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Protocol

import numpy as np

TOKEN_RE = re.compile(r"[a-z0-9]+")

DEFAULT_FASTEMBED_MODEL = "intfloat/multilingual-e5-large"


def _strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(_strip_diacritics(text.lower()))


class EmbeddingClient(Protocol):
    name: str
    dim: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class FastembedClient:
    """Local ONNX embedding model via fastembed (Qdrant). Multilingual by default."""

    def __init__(self, model_name: str = DEFAULT_FASTEMBED_MODEL) -> None:
        from fastembed import TextEmbedding  # imported lazily — heavy import

        self._TextEmbedding = TextEmbedding
        self.name = model_name
        self._model = TextEmbedding(model_name=model_name)
        probe = next(iter(self._model.embed(["dim probe"])))
        self.dim = int(probe.shape[0])

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        prefixed = [f"passage: {t}" for t in texts]
        return [vec.tolist() for vec in self._model.embed(prefixed)]

    def embed_query(self, text: str) -> list[float]:
        prefixed = f"query: {text}"
        return next(iter(self._model.embed([prefixed]))).tolist()


from functools import lru_cache


@lru_cache(maxsize=1)
def get_embedding_client() -> EmbeddingClient:
    model = os.environ.get("EMBED_MODEL", DEFAULT_FASTEMBED_MODEL)
    return FastembedClient(model_name=model)


class EmbeddingIndex:
    """In-memory vector search. Matrix rows are L2-normalized, so cosine = dot product."""

    def __init__(self, matrix: np.ndarray, slugs: list[str], client: EmbeddingClient) -> None:
        self.matrix = matrix.astype(np.float32)
        self.slugs = slugs
        self.client = client

    @classmethod
    def load(cls, matrix_path: Path, meta_path: Path, client: EmbeddingClient) -> EmbeddingIndex:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta["dim"] != client.dim:
            raise ValueError(
                f"Dim mismatch: index has {meta['dim']}, client {client.name!r} has {client.dim}. "
                "Rebuild with `uv run python scripts/build_embeddings.py`."
            )
        if meta["model"] != client.name:
            raise ValueError(
                f"Model mismatch: index built with {meta['model']!r}, client is {client.name!r}. "
                "Rebuild embeddings."
            )
        return cls(matrix=np.load(matrix_path), slugs=meta["slugs"], client=client)

    def search(self, query: str, top_k: int = 20) -> list[tuple[str, float]]:
        q = np.asarray(self.client.embed_query(query), dtype=np.float32)
        norm = float(np.linalg.norm(q))
        if norm:
            q /= norm
        scores = self.matrix @ q
        top_idx = np.argsort(scores)[-top_k:][::-1]
        return [(self.slugs[i], float(scores[i])) for i in top_idx]
