from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, status

from backend.schemas.drafts import DRAFT_REQUEST_EXAMPLES, DraftRequest, DraftResponse
from backend.services import drafter
from backend.services.llm import LLMError

router = APIRouter(tags=["drafts"])


@router.post("/drafts", response_model=DraftResponse)
def post_drafts(req: Annotated[DraftRequest, Body(openapi_examples=DRAFT_REQUEST_EXAMPLES)]) -> DraftResponse:
    """Outreach e-mails for one target group or the whole team at once.

    A target with `technology` gets an e-mail asking that group's lab for access to
    the technology (instead of an invitation into the team).

    Without `instruction` → generate fresh drafts. With `instruction` (+ `current`
    and optional `history` per target) → copilot revises them or answers a question.
    Partial batch failures are reported in `errors`; 502 only if nothing succeeded.
    """
    try:
        return drafter.draft(req)
    except drafter.UnknownGroups as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    except LLMError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"LLM error: {e}") from e
