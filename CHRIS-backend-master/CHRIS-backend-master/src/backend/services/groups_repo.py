import json
from functools import lru_cache
from pathlib import Path

from backend.models.domain import Group
from backend.services.embeddings import _tokenize

DATA_PATH = Path(__file__).resolve().parents[3] / "data" / "groups.json"


@lru_cache(maxsize=1)
def load_groups() -> list[Group]:
    """Load all NÚVR groups from the scraped JSON. Cached — read once per process."""
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [Group.model_validate(r) for r in raw]


def get_group(slug: str) -> Group | None:
    return next((g for g in load_groups() if g.slug == slug), None)


def _norm(s: str) -> str:
    return " ".join(_tokenize(s))


def find_group(ref: str) -> Group | None:
    """Resolve a slug, group name or PI name (case/diacritics-insensitive)."""
    if (g := get_group(ref)) is not None:
        return g
    key = _norm(ref)
    return next((g for g in load_groups() if key in (_norm(g.slug), _norm(g.name), _norm(g.pi))), None)


_STOPWORDS = {"pro", "pri", "nad", "pod", "jako", "nebo", "the", "and", "for", "with"}


def _content_tokens(text: str) -> set[str]:
    # Drop connectives ("a", "v", "pro") so they don't decide the match; keep acronyms like "HDX".
    return {t for t in _tokenize(text) if len(t) > 2 and t not in _STOPWORDS}


def find_group_by_technology(technology: str) -> Group | None:
    """The group whose expertise/infrastructures share the most tokens with `technology`."""
    wanted = _content_tokens(technology)
    best, best_score = None, 0
    for g in load_groups():
        score = len(wanted & _content_tokens(" ".join(g.expertise + g.infrastructures)))
        if score > best_score:
            best, best_score = g, score
    return best
