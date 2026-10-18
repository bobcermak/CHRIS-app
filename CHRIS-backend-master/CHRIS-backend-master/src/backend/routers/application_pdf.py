import re
import unicodedata
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import Response

from backend.schemas.application_pdf import ApplicationPdfRequest
from backend.services.application_pdf import render

router = APIRouter(tags=["application"])


def _filename(title: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|\r\n]+', " ", f"Přihláška – {title}").strip()[:120]
    return f"{safe}.pdf"


@router.post(
    "/application/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "A4 PDF of the application draft."}},
)
def post_application_pdf(req: ApplicationPdfRequest) -> Response:
    """The application draft as a downloadable A4 PDF (always with the AI-draft notice)."""
    name = _filename(req.title)
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode() or "prihlaska.pdf"
    return Response(
        content=render(req),
        media_type="application/pdf",
        headers={
            # RFC 6266: plain ASCII fallback + the real (Czech) name.
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}",
        },
    )
