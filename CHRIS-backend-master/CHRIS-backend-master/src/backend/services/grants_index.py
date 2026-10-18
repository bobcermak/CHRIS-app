"""Shared singleton loader for the pre-computed grant embeddings index."""

from functools import lru_cache
from pathlib import Path

from backend.services.embeddings import EmbeddingIndex, get_embedding_client

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
MATRIX_PATH = DATA_DIR / "grants_embeddings.npy"
META_PATH = DATA_DIR / "grants_embeddings_meta.json"


@lru_cache(maxsize=1)
def get_grants_index() -> EmbeddingIndex:
    return EmbeddingIndex.load(MATRIX_PATH, META_PATH, get_embedding_client())
