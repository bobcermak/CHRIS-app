"""Precompute embeddings for all funding opportunities in data/grants.json.

Mirrors scripts/build_embeddings.py but for the Grant model. Writes:

  data/grants_embeddings.npy
  data/grants_embeddings_meta.json

Usage:
    uv run python scripts/build_grants_embeddings.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from backend.services.embeddings import get_embedding_client  # noqa: E402

GRANTS_PATH = Path(__file__).resolve().parent.parent / "data" / "grants.json"
MATRIX_PATH = GRANTS_PATH.parent / "grants_embeddings.npy"
META_PATH = GRANTS_PATH.parent / "grants_embeddings_meta.json"


def build_profile_text(grant: dict) -> str:
    """Compose the text that represents a grant for embedding.
    Mirrors the group pipeline — pack semantic signal (title, programme,
    description, keywords) into a dense paragraph."""
    parts = [
        f"Grant: {grant['title']}",
        f"Agentura: {grant['agency']}",
    ]
    if grant.get("programme"):
        parts.append(f"Program: {grant['programme']}")
    if grant.get("description"):
        parts.append(f"Popis: {grant['description']}")
    if grant.get("keywords"):
        parts.append("Klíčová slova: " + ", ".join(grant["keywords"]))
    if grant.get("eligible_applicants"):
        parts.append(f"Žadatelé: {grant['eligible_applicants']}")
    return "\n\n".join(parts)


def main() -> int:
    client = get_embedding_client()
    print(f"→ Using embedding client: {client.name} (dim={client.dim})")

    grants = json.loads(GRANTS_PATH.read_text(encoding="utf-8"))
    print(f"→ Loaded {len(grants)} grants from {GRANTS_PATH.name}")

    texts = [build_profile_text(g) for g in grants]
    slugs = [g["slug"] for g in grants]

    print(f"→ Embedding {len(texts)} grant profiles...")
    vectors = client.embed_documents(texts)
    matrix = np.asarray(vectors, dtype=np.float32)

    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    matrix = np.where(norms > 0, matrix / norms, matrix)

    np.save(MATRIX_PATH, matrix)
    META_PATH.write_text(
        json.dumps(
            {"model": client.name, "dim": client.dim, "slugs": slugs},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"✓ Saved {MATRIX_PATH.name} ({matrix.shape}) and {META_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
