"""INTELLIGENCE-FIRST match pipeline:
query → LLM role plan (as many roles as needed) → per-role vector search →
greedy team → LLM review (reasons + fit; unfit roles become gaps).

If role planning fails, falls back to a plain vector search over the raw query
and returns N groups as the team with role name "Doporučená skupina" and empty
reasons. Reusable team-building steps live in `_team_steps.py`.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from backend.schemas.match import MatchResult, Role, TeamMember
from backend.services._team_steps import (
    assemble_team,
    gather_candidates,
    match_grants,
    parse_role_plan,
    select_team,
    size_rule,
)
from backend.services._tech_steps import recommend_technologies
from backend.services.groups_index import get_index
from backend.services.groups_repo import get_group
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import ROLE_PLAN_SYSTEM
from backend.services.study_title import generate_study_title_full

log = logging.getLogger(__name__)


# Team size for the no-LLM fallback, when the user gave none.
FALLBACK_TEAM_SIZE = 4


def _plan_roles(query: str, team_size: int | None) -> tuple[list[Role], str]:
    client = get_chat_client()
    system = ROLE_PLAN_SYSTEM.format(size_rule=size_rule(team_size))
    raw = client.complete_json(system=system, user=f"Výzkumný záměr: {query}")
    return parse_role_plan(raw, team_size)


def _fallback_match(
    query: str,
    team_size: int,
    warning: str,
    grants_top_k: int,
    tech_top_k: int,
    exclude_slugs: list[str],
    context: str | list[str] | None = None,
) -> MatchResult:
    """When LLM is unavailable, degrade to pure vector search."""
    log.warning("Falling back to vector search: %s", warning)
    index = get_index()
    excluded = set(exclude_slugs)
    hits = [h for h in index.search(query, top_k=team_size + len(excluded)) if h[0] not in excluded][:team_size]
    fallback_role = Role(
        name="Doporučená skupina",
        description="Vector search fallback (LLM nedostupný).",
    )
    team: list[TeamMember] = []
    for slug, score in hits:
        group = get_group(slug)
        if group is None:
            continue
        team.append(TeamMember(role=fallback_role, group=group, score=score))
    grants = match_grants(query, grants_top_k)
    title_res = generate_study_title_full(query, context=context)
    # Technologies also need LLM — skip in fallback.
    return MatchResult(
        query=query,
        title=title_res.title,
        role_plan=[fallback_role],
        team=team,
        grants=grants,
        technologies=[],
        warning=warning,
    )


def match(
    query: str,
    team_size: int | None = None,
    grants_top_k: int = 5,
    tech_top_k: int = 4,
    exclude_slugs: list[str] | None = None,
    nodes: list[str] | None = None,
    context: str | list[str] | None = None,
) -> MatchResult:
    """`team_size` None = the AI decides how many groups; a number is an upper limit."""
    exclude_slugs = exclude_slugs or []
    # Plan roles, propose technologies, and generate study title in parallel.
    with ThreadPoolExecutor(max_workers=3) as ex:
        roles_f = ex.submit(_plan_roles, query, team_size)
        techs_f = ex.submit(recommend_technologies, query, tech_top_k)
        title_f = ex.submit(generate_study_title_full, query, context)
        try:
            roles, rationale = roles_f.result()
        except LLMError as e:
            # Cancel is best-effort; let the tech future finish silently in the background.
            return _fallback_match(
                query,
                team_size or FALLBACK_TEAM_SIZE,
                f"Role planning failed: {e}",
                grants_top_k,
                tech_top_k,
                exclude_slugs,
                context=context,
            )
        technologies = techs_f.result()  # recommend_technologies already handles LLMError internally
        title_res = title_f.result()

    candidates = gather_candidates(roles, exclude_slugs=exclude_slugs, nodes=nodes)
    try:
        team, gaps, summary = select_team(query, roles, candidates)
    except LLMError as e:
        log.warning("Team selection failed, using top vector-search candidates without reasons: %s", e)
        team, gaps = assemble_team(roles, candidates)
        summary = ""

    grants = match_grants(query, grants_top_k)

    return MatchResult(
        query=query,
        title=title_res.title,
        role_plan=roles,
        team=team,
        gaps=gaps,
        team_rationale=rationale,
        team_summary=summary,
        grants=grants,
        technologies=technologies,
    )
