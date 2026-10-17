from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.models.domain import Group
from backend.services.groups_index import get_index
from backend.services.groups_repo import get_group, load_groups

router = APIRouter(prefix="/groups", tags=["groups"])


class SearchHit(BaseModel):
    score: float
    group: Group


@router.get("", response_model=list[Group])
def list_groups(
    node: str | None = Query(default=None, description="Filter by uzel (Praha/Brno/Olomouc)."),
    program: str | None = Query(default=None, description="Substring match on research program."),
) -> list[Group]:
    groups = load_groups()
    if node:
        groups = [g for g in groups if g.node.lower() == node.lower()]
    if program:
        needle = program.lower()
        groups = [g for g in groups if any(needle in p.lower() for p in g.programs)]
    return groups


@router.get("/search", response_model=list[SearchHit])
def search_groups(
    q: str = Query(..., min_length=2, description="Free-text research query."),
    top_k: int = Query(default=10, ge=1, le=65),
) -> list[SearchHit]:
    index = get_index()
    hits = index.search(q, top_k=top_k)
    results: list[SearchHit] = []
    for slug, score in hits:
        group = get_group(slug)
        if group is not None:
            results.append(SearchHit(score=score, group=group))
    return results


@router.get("/{slug}", response_model=Group)
def get_group_detail(slug: str) -> Group:
    group = get_group(slug)
    if group is None:
        raise HTTPException(status_code=404, detail=f"Group '{slug}' not found")
    return group
