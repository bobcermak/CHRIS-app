"""Technology recommendation steps — shared by both match pipelines.

Flow:
  1. LLM proposes `top_k` technologies/methods needed for the query.
  2. For each proposed technology, vector-search the existing NÚVR groups
     index (which already embeds expertise + focus) → top-N provider groups.
  3. Assemble `Technology` objects with provider info (where to physically
     access the method: node, faculty) + a short "evidence" line pulled
     from the group's expertise list.

Reuses the groups index — no new embeddings file is built, since 65 groups
are small enough that query-time matching over the full group profile works
well for method/capability lookups.
"""

from __future__ import annotations

import logging

from backend.models.domain import Group
from backend.schemas.match import Technology, TechnologyProvider
from backend.services.groups_index import get_index
from backend.services.groups_repo import get_group
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import TECH_PROPOSE_SYSTEM

log = logging.getLogger(__name__)

PROVIDERS_PER_TECH = 3


def _best_expertise_lines(group: Group, needle: str, limit: int = 2) -> str:
    """Pick expertise lines most relevant to the needle (simple substring + fallback)."""
    if not group.expertise:
        return ""
    low_needle_tokens = {t for t in needle.lower().split() if len(t) >= 4}
    scored: list[tuple[int, str]] = []
    for line in group.expertise:
        line_low = line.lower()
        hits = sum(1 for t in low_needle_tokens if t in line_low)
        scored.append((hits, line))
    scored.sort(key=lambda x: -x[0])
    picked = [line for _, line in scored[:limit]]
    return " | ".join(picked)


def propose_technologies(query: str, top_k: int) -> list[dict]:
    """Returns [{name, description}] — raw dicts, not yet with providers."""
    if top_k <= 0:
        return []
    client = get_chat_client()
    system = TECH_PROPOSE_SYSTEM.format(top_k=top_k)
    raw = client.complete_json(system=system, user=f"Výzkumný záměr: {query}")
    techs_raw = raw.get("technologies")
    if not isinstance(techs_raw, list) or not techs_raw:
        raise LLMError(f"Tech proposal missing 'technologies' array: {raw}")
    out: list[dict] = []
    for t in techs_raw[:top_k]:
        name = t.get("name")
        desc = t.get("description")
        if isinstance(name, str) and isinstance(desc, str) and name and desc:
            out.append({"name": name, "description": desc})
    return out


def find_providers(technologies: list[dict]) -> list[Technology]:
    """For each proposed technology, vector-search groups and attach providers."""
    index = get_index()
    out: list[Technology] = []
    for t in technologies:
        hits = index.search(t["description"], top_k=PROVIDERS_PER_TECH)
        providers: list[TechnologyProvider] = []
        infra_set: set[str] = set()
        for slug, score in hits:
            group = get_group(slug)
            if group is None:
                continue
            providers.append(
                TechnologyProvider(
                    group_slug=group.slug,
                    group_name=group.name,
                    pi=group.pi,
                    node=group.node,
                    faculties=group.faculties,
                    score=score,
                    evidence=_best_expertise_lines(group, t["name"] + " " + t["description"]),
                )
            )
            for infra in group.infrastructures:
                infra_set.add(infra)
        out.append(
            Technology(
                name=t["name"],
                description=t["description"],
                providers=providers,
                infrastructures=sorted(infra_set),
            )
        )
    return out


def recommend_technologies(query: str, top_k: int) -> list[Technology]:
    """Full pipeline: propose + find providers. Returns [] on LLM failure."""
    if top_k <= 0:
        return []
    try:
        proposed = propose_technologies(query, top_k)
    except LLMError as e:
        log.warning("Tech proposal failed, skipping technologies: %s", e)
        return []
    return find_providers(proposed)
