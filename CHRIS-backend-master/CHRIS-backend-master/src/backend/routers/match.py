from fastapi import APIRouter, HTTPException

from backend.schemas.match import (
    GrantFirstRequest,
    GrantFirstResult,
    MatchRequest,
    MatchResult,
    RefineRequest,
    StudyTitleRequest,
    StudyTitleResponse,
)
from backend.services.grant_first_assembler import grant_first_match
from backend.services.groups_repo import get_group
from backend.services.study_title import generate_study_title_full
from backend.services.team_assembler import match
from backend.services.team_refiner import refine as refine_team

router = APIRouter(tags=["match"])


@router.post("/study-title", response_model=StudyTitleResponse)
def post_study_title(req: StudyTitleRequest) -> StudyTitleResponse:
    """Generate a memorable, impact-driven study title using Tomáš Studeník's methodology."""
    res = generate_study_title_full(req.query, context=req.context)
    return StudyTitleResponse(
        title=res.title,
        archetype=res.archetype,
        alternatives=res.alternatives,
    )


@router.post("/match", response_model=MatchResult)
def post_match(req: MatchRequest) -> MatchResult:
    return match(
        query=req.query,
        team_size=req.team_size,
        grants_top_k=req.grants_top_k,
        tech_top_k=req.tech_top_k,
        exclude_slugs=req.exclude_slugs,
        nodes=req.nodes,
        context=req.context,
    )


@router.post("/match/grant-first", response_model=GrantFirstResult)
def post_grant_first(req: GrantFirstRequest) -> GrantFirstResult:
    return grant_first_match(
        query=req.query,
        top_grants=req.top_grants,
        team_size=req.team_size,
        tech_top_k=req.tech_top_k,
        context=req.context,
    )


@router.post("/match/refine", response_model=MatchResult)
def post_refine(req: RefineRequest) -> MatchResult:
    missing = [m.group_slug for m in req.members if get_group(m.group_slug) is None]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown group_slug(s): {missing}")
    return refine_team(req)
