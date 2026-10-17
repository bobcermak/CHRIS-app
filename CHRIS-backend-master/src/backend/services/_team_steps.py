"""Shared team-assembly steps reused by both the INTELLIGENCE-FIRST pipeline
(team_assembler.match) and the GRANT-FIRST pipeline (grant_first_assembler).

Each helper is stateless. The two orchestrators compose these the same way;
the only thing that differs is how roles are planned (query-only vs. query × grant).

Team size is dynamic: the LLM plans as many roles as the project needs, then
picks for each role the group that really fits from its top vector-search
candidates (`select_team`). One group may cover up to two roles, and a role no
candidate fits becomes a `Gap` instead of a forced weak match. Vector search
alone is too noisy for the pick (scores are compressed), so `assemble_team`
(top-1 greedy) is only the fallback when the LLM is unavailable.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.models.domain import Group
from backend.schemas.match import MAX_TEAM_SIZE, MIN_TEAM_SIZE, Gap, GrantMatch, Role, TeamMember
from backend.services.grants_index import get_grants_index
from backend.services.grants_repo import get_grant
from backend.services.groups_index import get_index
from backend.services.groups_repo import get_group
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import EXPLAIN_SYSTEM, SELECT_SYSTEM

PER_ROLE_CANDIDATES = 5
MAX_ROLES_PER_GROUP = 2
NO_CANDIDATE_REASON = "V katalogu NÚVR není skupina, která by této roli odpovídala."
# Search wider when filtering, so exclusions don't empty a role.
FILTERED_SEARCH_K = 20
NODE_BONUS = 0.03


@dataclass(frozen=True)
class Candidate:
    slug: str
    score: float


def gather_candidates(
    roles: list[Role],
    exclude_slugs: list[str] | None = None,
    nodes: list[str] | None = None,
) -> dict[str, list[Candidate]]:
    """Top candidates per role. Excluded slugs are dropped; candidates in a preferred
    node are ranked with a small bonus (the reported score stays the raw similarity)."""
    index = get_index()
    excluded = set(exclude_slugs or [])
    preferred = {n.lower() for n in nodes or []}
    top_k = FILTERED_SEARCH_K if excluded or preferred else PER_ROLE_CANDIDATES
    out: dict[str, list[Candidate]] = {}
    for role in roles:
        hits = [(s, sc) for s, sc in index.search(role.description, top_k=top_k) if s not in excluded]
        if preferred:

            def _rank(hit: tuple[str, float]) -> float:
                group = get_group(hit[0])
                return hit[1] + (NODE_BONUS if group and group.node.lower() in preferred else 0.0)

            hits.sort(key=_rank, reverse=True)
        out[role.name] = [Candidate(slug=s, score=sc) for s, sc in hits[:PER_ROLE_CANDIDATES]]
    return out


def size_rule(team_size: int | None) -> str:
    """Instruction for the role-plan prompt: the AI decides, within [MIN, cap]."""
    cap = team_size or MAX_TEAM_SIZE
    return (
        f"Navrhni {MIN_TEAM_SIZE}–{cap} rolí (nikdy méně než {MIN_TEAM_SIZE}, nikdy více než {cap}) — "
        "tolik, kolik projekt reálně potřebuje. Vždy navrhni alespoň jednoho spolupracovníka "
        "nad rámec hlavního vědce, i když jde o malý projekt."
    )


def parse_role_plan(raw: dict[str, Any], team_size: int | None) -> tuple[list[Role], str]:
    """Roles (must first, capped) and the one-sentence rationale for the team size."""
    roles_raw = raw.get("roles")
    if not isinstance(roles_raw, list) or not roles_raw:
        raise LLMError(f"Role plan missing 'roles' array: {raw}")
    roles: list[Role] = []
    for r in roles_raw:
        if not isinstance(r, dict):
            continue
        if r.get("priority") not in ("must", "nice"):
            r = {**r, "priority": "must"}
        try:
            roles.append(Role.model_validate(r))
        except ValueError:
            continue
    if len(roles) < MIN_TEAM_SIZE:
        raise LLMError(f"Role plan returned {len(roles)} role(s), need at least {MIN_TEAM_SIZE}: {raw}")
    roles.sort(key=lambda role: role.priority != "must")  # stable: keeps the LLM's order within each priority
    rationale = raw.get("team_rationale")
    return roles[: team_size or MAX_TEAM_SIZE], rationale.strip() if isinstance(rationale, str) else ""


def assemble_team(
    roles: list[Role], candidates: dict[str, list[Candidate]]
) -> tuple[list[TeamMember], list[Gap]]:
    """Greedy, in role order: the best candidate wins — a new group, or one already in
    the team that still has room (max MAX_ROLES_PER_GROUP roles). Roles without any
    candidate become gaps."""
    team: list[TeamMember] = []
    by_slug: dict[str, TeamMember] = {}
    gaps: list[Gap] = []
    for role in roles:
        placed = False
        for cand in candidates.get(role.name, []):
            member = by_slug.get(cand.slug)
            if member is not None:
                if 1 + len(member.also_covers) < MAX_ROLES_PER_GROUP:
                    member.also_covers.append(role)
                    placed = True
                    break
                continue
            group = get_group(cand.slug)
            if group is None:
                continue
            member = TeamMember(role=role, group=group, score=cand.score)
            team.append(member)
            by_slug[cand.slug] = member
            placed = True
            break
        if not placed:
            gaps.append(Gap(role=role, reason=NO_CANDIDATE_REASON))
    return team, gaps


def _profile(g: Group) -> dict[str, Any]:
    # Trim aggressively: `select_team` sends profiles for ~20 groups in one payload;
    # anything beyond the top signals bloats tokens without changing the pick.
    return {
        "name": g.name,
        "pi": g.pi,
        "node": g.node,
        "focus": g.focus[:300],
        "expertise": g.expertise[:5],
        "publications": g.publications[:1],
        "infrastructures": g.infrastructures[:4],
    }


def select_team(
    query: str, roles: list[Role], candidates: dict[str, list[Candidate]]
) -> tuple[list[TeamMember], list[Gap], str]:
    """One LLM call: for each role pick the fitting group among its candidates (or none
    → gap), with a one-sentence reason, plus a summary of the resulting team. A pick
    from another role's candidates is fine (the LLM saw its profile) and is scored
    against this role; a group the LLM was not shown, or a pick beyond
    MAX_ROLES_PER_GROUP for one group, becomes a gap. Raises LLMError — callers fall
    back to `assemble_team`."""
    if not roles:
        return [], [], ""
    groups = {
        c.slug: g
        for role in roles
        for c in candidates.get(role.name, [])
        if (g := get_group(c.slug)) is not None
    }
    user_payload = json.dumps(
        {
            "query": query,
            "roles": [
                {
                    **role.model_dump(include={"name", "description", "priority"}),
                    "candidates": [c.slug for c in candidates.get(role.name, []) if c.slug in groups],
                }
                for role in roles
            ],
            "groups": {slug: _profile(g) for slug, g in groups.items()},
        },
        ensure_ascii=False,
    )
    raw = get_chat_client().complete_json(system=SELECT_SYSTEM, user=user_payload)
    picks: dict[str, tuple[str | None, str]] = {}
    for item in raw.get("assignments") or []:
        if not isinstance(item, dict) or not isinstance(item.get("role"), str):
            continue
        slug, reason = item.get("slug"), item.get("reason")
        picks[item["role"]] = (slug if isinstance(slug, str) else None, reason if isinstance(reason, str) else "")
    if not picks:
        raise LLMError(f"Team selection returned no assignments: {str(raw)[:300]}")

    team: list[TeamMember] = []
    by_slug: dict[str, TeamMember] = {}
    gaps: list[Gap] = []
    for role in roles:
        slug, reason = picks.get(role.name, (None, ""))
        if slug is None or slug not in groups:
            gaps.append(Gap(role=role, reason=reason if slug is None and reason else NO_CANDIDATE_REASON))
            continue
        score = next((c.score for c in candidates.get(role.name, []) if c.slug == slug), None)
        if score is None:
            score = score_group_against(role.description, slug)
        member = by_slug.get(slug)
        if member is None:
            member = TeamMember(role=role, group=groups[slug], score=score, reason=reason)
            team.append(member)
            by_slug[slug] = member
        elif 1 + len(member.also_covers) < MAX_ROLES_PER_GROUP:
            member.also_covers.append(role)
        else:
            gaps.append(Gap(role=role, reason=f"{member.group.name} už pokrývá {MAX_ROLES_PER_GROUP} role."))
    summary = raw.get("team_summary")
    return team, gaps, summary.strip() if isinstance(summary, str) else ""

def explain_team(query: str, team: list[TeamMember]) -> None:
    """Mutates `reason` on each member via a single LLM call. Used by /match/refine,
    where the user already picked the groups (no selection, no gaps)."""
    if not team:
        return
    user_payload = json.dumps(
        {
            "query": query,
            "team": [
                {"role": m.role.model_dump(include={"name", "description"}), "group": {"slug": m.group.slug, **_profile(m.group)}}
                for m in team
            ],
        },
        ensure_ascii=False,
    )
    raw = get_chat_client().complete_json(system=EXPLAIN_SYSTEM, user=user_payload)
    reasons_by_slug: dict[str, str] = {}
    for item in raw.get("reasons", []):
        slug = item.get("slug")
        reason = item.get("reason")
        if isinstance(slug, str) and isinstance(reason, str):
            reasons_by_slug[slug] = reason
    for member in team:
        member.reason = reasons_by_slug.get(member.group.slug, "")


def match_grants(query: str, top_k: int) -> list[GrantMatch]:
    """Pure vector search over curated grants. No LLM reasoning (fast path)."""
    if top_k <= 0:
        return []
    index = get_grants_index()
    hits = index.search(query, top_k=top_k)
    matches: list[GrantMatch] = []
    for slug, score in hits:
        grant = get_grant(slug)
        if grant is not None:
            matches.append(GrantMatch(grant=grant, score=score))
    return matches


def score_group_against(role_description: str, group_slug: str) -> float:
    """Cosine similarity role.description ↔ group embedding row.

    Pre-computed matrix is L2-normalized, so dot product == cosine. Returns 0.0
    if the slug isn't in the index (shouldn't happen if slug was validated upstream).
    """
    index = get_index()
    try:
        row = index.slugs.index(group_slug)
    except ValueError:
        return 0.0
    q = np.asarray(index.client.embed_query(role_description), dtype=np.float32)
    norm = float(np.linalg.norm(q))
    if norm:
        q /= norm
    return float(index.matrix[row] @ q)
