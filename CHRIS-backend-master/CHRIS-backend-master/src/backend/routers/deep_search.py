"""Deep search endpoints — Perplexity-backed enrichment for a single entity.

Three endpoints (one per entity type) because scopes differ. All return the
same `DeepSearchResult` shape. 503 is used for upstream Perplexity failures
so FE can retry independently of 4xx validation errors.
"""

from fastapi import APIRouter, HTTPException

from backend.schemas.deep_search import (
    DeepSearchResult,
    GrantDeepRequest,
    GroupDeepRequest,
    TechnologyDeepRequest,
)
from backend.services.deep_search import (
    deep_search_grant,
    deep_search_group,
    deep_search_technology,
)
from backend.services.grants_repo import get_grant
from backend.services.groups_repo import get_group
from backend.services.perplexity import DeepSearchError

router = APIRouter(prefix="/deep-search", tags=["deep-search"])


@router.post("/group", response_model=DeepSearchResult)
def post_group(req: GroupDeepRequest) -> DeepSearchResult:
    group = get_group(req.slug)
    if group is None:
        raise HTTPException(status_code=404, detail=f"Group '{req.slug}' not found")
    try:
        return deep_search_group(group)
    except DeepSearchError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/grant", response_model=DeepSearchResult)
def post_grant(req: GrantDeepRequest) -> DeepSearchResult:
    grant = get_grant(req.slug)
    if grant is None:
        raise HTTPException(status_code=404, detail=f"Grant '{req.slug}' not found")
    try:
        return deep_search_grant(grant)
    except DeepSearchError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/technology", response_model=DeepSearchResult)
def post_technology(req: TechnologyDeepRequest) -> DeepSearchResult:
    try:
        return deep_search_technology(req.name, req.description)
    except DeepSearchError as e:
        raise HTTPException(status_code=503, detail=str(e))
