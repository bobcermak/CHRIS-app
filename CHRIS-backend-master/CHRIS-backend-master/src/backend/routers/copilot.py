from fastapi import APIRouter, HTTPException, status

from backend.schemas.copilot import CopilotRequest, CopilotResult
from backend.services import copilot
from backend.services.llm import LLMError

router = APIRouter(tags=["copilot"])


@router.post("/copilot")
def post_copilot(req: CopilotRequest) -> CopilotResult:
    """Application copilot — a strict panel reviewer that helps with the whole application.

    - `oppose` (default): formal checks + panel review of every section, a per-criterion
      score, and `reply` to `instruction` (the copilot chat). An LLM outage still returns
      the formal checks with a note.
    - `write` + `section_key`: a draft of that section (`section_patch`) with its weakest
      points; 502 when no draft can be produced.
    """
    try:
        return copilot.run(req)
    except LLMError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"LLM error: {e}") from e
