"""GRANT-FIRST match pipeline.

Flow (per CLAUDE.md variant description):
  1. Vector-search `top_grants` best grants for the query.
  2. For each grant in parallel:
     - LLM designs a role_plan constrained by the grant's rules
       (e.g. AZV requires a clinical co-investigator, TA ČR TREND requires an
       industry partner, MSCA requires an individual fellow + host).
     - Per-role vector search in NÚVR groups.
     - Greedy assembly into a team.
     - LLM writes per-member reasons.
  3. Return N `GrantOption`s, each with its own derived team.

Parallelization uses `ThreadPoolExecutor` — LLM calls are IO-bound, GIL releases
on network I/O, so threads realize wall-clock speedup. If any single grant
option fails, it is dropped from the response and the rest proceed.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from backend.models.domain import Grant
from backend.schemas.match import GrantFirstResult, GrantOption, Role
from backend.services._team_steps import (
    assemble_team,
    gather_candidates,
    parse_role_plan,
    select_team,
    size_rule,
)
from backend.services._tech_steps import recommend_technologies
from backend.services.grants_index import get_grants_index
from backend.services.grants_repo import get_grant
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import GRANT_FIRST_ROLE_PLAN_SYSTEM
from backend.services.study_title import generate_study_title_full

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class _GrantHit:
    grant: Grant
    score: float


@dataclass(frozen=True)
class _GrantPlan:
    grant_fit: str
    roles: list[Role]
    team_rationale: str


def _top_grants(query: str, top_k: int) -> list[_GrantHit]:
    index = get_grants_index()
    hits = index.search(query, top_k=top_k)
    out: list[_GrantHit] = []
    for slug, score in hits:
        grant = get_grant(slug)
        if grant is not None:
            out.append(_GrantHit(grant=grant, score=score))
    return out


def _plan_grant_roles(query: str, grant: Grant, team_size: int | None) -> _GrantPlan:
    client = get_chat_client()
    system = GRANT_FIRST_ROLE_PLAN_SYSTEM.format(size_rule=size_rule(team_size))
    user_payload = json.dumps(
        {
            "vyzkumny_zamer": query,
            "grant": {
                "title": grant.title,
                "agency": grant.agency,
                "programme": grant.programme,
                "description": grant.description,
                "keywords": grant.keywords,
                "eligible_applicants": grant.eligible_applicants,
            },
        },
        ensure_ascii=False,
    )
    raw = client.complete_json(system=system, user=user_payload)
    roles, rationale = parse_role_plan(raw, team_size)
    grant_fit = raw.get("grant_fit", "")
    if not isinstance(grant_fit, str):
        grant_fit = ""
    return _GrantPlan(grant_fit=grant_fit, roles=roles, team_rationale=rationale)


def _build_option(query: str, hit: _GrantHit, team_size: int | None) -> GrantOption | None:
    try:
        plan = _plan_grant_roles(query, hit.grant, team_size)
    except LLMError as e:
        log.warning("Grant option %s: role plan failed: %s", hit.grant.slug, e)
        return None

    candidates = gather_candidates(plan.roles)
    try:
        team, gaps, summary = select_team(query, plan.roles, candidates)
    except LLMError as e:
        # Keep the option with top vector-search picks, just without reasons. Partial > total failure.
        log.warning("Grant option %s: team selection failed, using top candidates: %s",
                    hit.grant.slug, e)
        team, gaps = assemble_team(plan.roles, candidates)
        summary = ""

    return GrantOption(
        grant=hit.grant,
        grant_score=hit.score,
        grant_fit=plan.grant_fit,
        role_plan=plan.roles,
        team=team,
        gaps=gaps,
        team_rationale=plan.team_rationale,
        team_summary=summary,
    )


def grant_first_match(
    query: str,
    top_grants: int = 3,
    team_size: int | None = None,
    tech_top_k: int = 4,
    context: str | list[str] | None = None,
) -> GrantFirstResult:
    hits = _top_grants(query, top_grants)
    if not hits:
        return GrantFirstResult(query=query, grant_options=[], warning="No grants in database.")

    # Build grant options AND propose technologies in parallel. Technologies are
    # query-driven (not grant-driven), so one list applies to all options.
    workers = len(hits) + 2
    with ThreadPoolExecutor(max_workers=workers) as ex:
        tech_future = ex.submit(recommend_technologies, query, tech_top_k)
        title_future = ex.submit(generate_study_title_full, query, context)
        option_futures = [ex.submit(_build_option, query, h, team_size) for h in hits]
        results = [f.result() for f in option_futures]
        technologies = tech_future.result()
        title_res = title_future.result()

    options = [o for o in results if o is not None]
    warning: str | None = None
    failed = len(results) - len(options)
    if failed:
        warning = f"{failed} of {len(results)} grant options failed."
    return GrantFirstResult(
        query=query,
        title=title_res.title,
        grant_options=options,
        technologies=technologies,
        warning=warning,
    )
