from fastapi import APIRouter

from backend.schemas.clarify import ClarifyRequest, ClarifyResponse
from backend.services.clarifier import clarify

router = APIRouter(tags=["clarify"])


@router.post("/clarify", response_model=ClarifyResponse)
def post_clarify(req: ClarifyRequest) -> ClarifyResponse:
    """Next round of follow-up questions for an incomplete project prompt.

    Stateless: send `prompt`, composer `context` and all finished rounds in
    `history`. Returns new `questions`, or `ready=True` (no questions) once the
    prompt is clear enough, after `MAX_ROUNDS`, or when `finish` is set. `brief`
    is always filled and goes straight into POST /match.
    """
    return clarify(req)
