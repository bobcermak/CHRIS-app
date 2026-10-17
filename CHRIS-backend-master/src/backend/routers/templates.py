from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from backend.schemas.templates import ApplicationTemplate
from backend.services import call_docs, template_resolver

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("/resolve")
def resolve_template(
    url: Annotated[str | None, Form(max_length=2000, description="Call page, or a PDF/DOCX link.")] = None,
    file: Annotated[UploadFile | None, File(description="Call documentation, PDF or DOCX (max 15 MB).")] = None,
    grant: Annotated[str | None, Form(max_length=200, description="Grant slug the template is for, if known.")] = None,
) -> ApplicationTemplate:
    """Application template for a call without a library template (§9.5), from its documentation.

    Send `url` (the call page — its linked template / call documents are followed —
    or a direct PDF/DOCX link) **or** `file`. Every section cites the page or part
    of the documentation it came from and comes unconfirmed (`status="extracted"`).
    When nothing can be extracted the generic outline comes back
    (`status="generic"`) with a `warning`. 422 = the documentation can't be read.
    """
    if (url is None) == (file is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pošlete buď odkaz, nebo soubor.")
    try:
        if file is not None:
            # Read one byte past the cap so an oversized upload is rejected without buffering it all.
            data = file.file.read(call_docs.MAX_BYTES + 1)
            docs = call_docs.read_upload(file.filename or "dokument", data, file.content_type or "")
        else:
            assert url is not None
            docs = call_docs.fetch_documents(url.strip())
    except call_docs.DocumentError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    return template_resolver.resolve(docs, grant_slug=grant)
