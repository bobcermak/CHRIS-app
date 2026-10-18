from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.models.domain import Grant
from backend.services.grants_index import get_grants_index
from backend.services.grants_repo import get_grant, load_grants

router = APIRouter(prefix="/grants", tags=["grants"])


class GrantHit(BaseModel):
    score: float
    grant: Grant


@router.get("", response_model=list[Grant])
def list_grants(
    agency: str | None = Query(default=None, description="Substring match on agency name."),
) -> list[Grant]:
    grants = load_grants()
    if agency:
        needle = agency.lower()
        grants = [g for g in grants if needle in g.agency.lower()]
    return grants


@router.get("/search", response_model=list[GrantHit])
def search_grants(
    q: str = Query(..., min_length=2, description="Free-text research query."),
    top_k: int = Query(default=5, ge=1, le=50),
) -> list[GrantHit]:
    index = get_grants_index()
    hits = index.search(q, top_k=top_k)
    results: list[GrantHit] = []
    for slug, score in hits:
        grant = get_grant(slug)
        if grant is not None:
            results.append(GrantHit(score=score, grant=grant))
    return results


@router.get("/{slug}", response_model=Grant)
def get_grant_detail(slug: str) -> Grant:
    grant = get_grant(slug)
    if grant is None:
        raise HTTPException(status_code=404, detail=f"Grant '{slug}' not found")
    return grant
