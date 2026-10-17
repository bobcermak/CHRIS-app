"""Precompute embeddings for all NÚVR groups.

Reads data/groups.json, builds a profile text per group, calls FastembedClient, and persists:

  data/groups_embeddings.npy          # NumPy array, shape (N, DIM), L2-normalized rows
  data/groups_embeddings_meta.json    # {model, dim, slugs: [...] in matrix row order}

Usage:
    uv run python scripts/build_embeddings.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from backend.services.embeddings import get_embedding_client  # noqa: E402

GROUPS_PATH = Path(__file__).resolve().parent.parent / "data" / "groups.json"
MATRIX_PATH = GROUPS_PATH.parent / "groups_embeddings.npy"
META_PATH = GROUPS_PATH.parent / "groups_embeddings_meta.json"


def build_profile_text(group: dict) -> str:
    """Compose the text that represents a group for embedding.
    Fields selected to maximize semantic signal; structured relations like
    `collaborations` and `infrastructures` are intentionally excluded — they
    carry graph/filter value, not semantic text value."""
    parts = [
        f"Skupina: {group['name']}",
        f"Vedoucí: {group['pi']}",
        f"Uzel: {group.get('node', '')}; Pracoviště: {', '.join(group.get('faculties', []))}",
        f"Programy: {', '.join(group.get('programs', []))}",
    ]
    if group.get("mission"):
        parts.append(f"Mise: {group['mission']}")
    if group.get("vision"):
        parts.append(f"Vize: {group['vision']}")
    if group.get("focus"):
        parts.append(f"Zaměření: {group['focus']}")
    if group.get("expertise"):
        parts.append("Expertiza a technologie: " + " | ".join(group["expertise"]))
    if group.get("publications"):
        parts.append("Publikace: " + " / ".join(group["publications"][:5]))
    return "\n\n".join(parts)


def main() -> int:
    client = get_embedding_client()
    print(f"→ Using embedding client: {client.name} (dim={client.dim})")

    groups = json.loads(GROUPS_PATH.read_text(encoding="utf-8"))
    print(f"→ Loaded {len(groups)} groups from {GROUPS_PATH.name}")

    texts = [build_profile_text(g) for g in groups]
    slugs = [g["slug"] for g in groups]

    print(f"→ Embedding {len(texts)} profiles...")
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
