import json
from functools import lru_cache
from pathlib import Path

from backend.models.domain import Grant

DATA_PATH = Path(__file__).resolve().parents[3] / "data" / "grants.json"


@lru_cache(maxsize=1)
def load_grants() -> list[Grant]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [Grant.model_validate(r) for r in raw]


def get_grant(slug: str) -> Grant | None:
    return next((g for g in load_grants() if g.slug == slug), None)
