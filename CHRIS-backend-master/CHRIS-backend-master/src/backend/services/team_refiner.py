"""Team refine pipeline.

The frontend owns all exploration: live vector search widget shows the user
candidate groups as they type. By the time a refine request reaches here, the
user has already decided exactly which groups fill which roles. The backend's
job is dumb assembly: validate slugs, build team, run `explain_team` to
regenerate reasons in the new team's context, and recompute grants/technologies
(the query hasn't changed, so results are near-identical to the baseline, but
we recompute to keep the response shape identical to `/match`).

LLM calls (`explain_team`, `recommend_technologies`) run in parallel. Grants are
a pure vector lookup, run after.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from backend.schemas.match import MatchResult, RefineRequest, Role, TeamMember
from backend.services._team_steps import (
    explain_team,
    match_grants,
    score_group_against,
)
from backend.services._tech_steps import recommend_technologies
from backend.services.groups_repo import get_group
from backend.services.llm import LLMError

log = logging.getLogger(__name__)


def refine(req: RefineRequest) -> MatchResult:
    role_plan: list[Role] = [
        Role(name=m.role_name, description=m.role_description) for m in req.members
    ]

    team: list[TeamMember] = []
    for role, member in zip(role_plan, req.members):
        group = get_group(member.group_slug)
        if group is None:
            # Caller must validate upstream; this is a last-ditch safety net.
            raise ValueError(f"Unknown group_slug: {member.group_slug}")
        score = score_group_against(role.description, member.group_slug)
        team.append(TeamMember(role=role, group=group, score=score))

    warnings: list[str] = []
    with ThreadPoolExecutor(max_workers=2) as ex:
        explain_f = ex.submit(explain_team, req.query, team)
        tech_f = ex.submit(recommend_technologies, req.query, req.tech_top_k)
        try:
            explain_f.result()
        except LLMError as e:
            warnings.append(f"Vysvětlení LLM selhalo: {e}")
            log.warning("Refine explain failed: %s", e)
        technologies = tech_f.result()

    grants = match_grants(req.query, req.grants_top_k)

    return MatchResult(
        query=req.query,
        role_plan=role_plan,
        team=team,
        grants=grants,
        technologies=technologies,
        warning="; ".join(warnings) if warnings else None,
    )
