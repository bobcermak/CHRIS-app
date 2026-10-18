"""Application templates (ARCHITECTURE §9.5) — the outline of a grant application.

A call without a library template is resolved from its documentation: a link to
the call page (scraped, linked PDF/DOCX documents followed) or an uploaded PDF/DOCX.
Every extracted section and limit cites the place in the documentation it came
from; nothing is generated from model memory. When extraction fails or finds
nothing, the generic outline comes back (`status="generic"`) with a `warning`.

Stateless — the client keeps the template and the user's confirmations.
"""

from typing import Literal

from pydantic import BaseModel, Field

TemplateStatus = Literal["verified", "derived", "extracted", "generic"]
Agency = Literal["AZV", "GACR", "TACR", "HORIZON", "OTHER"]
Language = Literal["cs", "en"]


class TemplateLimits(BaseModel):
    max_chars: int | None = Field(default=None, gt=0)
    max_pages: int | None = Field(default=None, gt=0)
    max_words: int | None = Field(default=None, gt=0)
    font_pt: float | None = Field(default=None, gt=0)
    line_spacing: float | None = Field(default=None, gt=0)
    max_mb: float | None = Field(default=None, gt=0)


class TemplateCitation(BaseModel):
    """A place in the call documentation: one page of a PDF, or one part of a web page / DOCX."""

    id: str
    label: str              # "Zadávací dokumentace.pdf, str. 4" · "Web výzvy, část 2"
    url: str = ""           # where the user can open it ("" for an uploaded file)
    page: int | None = None  # 1-based PDF page
    snippet: str = Field(default="", max_length=400)


class TemplateSection(BaseModel):
    key: str
    title: str
    required: bool = True
    hint: str = ""
    limits: TemplateLimits | None = None
    confirmed: bool = False  # only `verified` templates come confirmed; the user confirms the rest
    citation_ids: list[str] = Field(default_factory=list)


class ApplicationTemplate(BaseModel):
    id: str
    status: TemplateStatus
    agency: Agency = "OTHER"
    scheme: str
    version: str = "—"
    language: Language = "cs"
    based_on: str | None = None
    diff: list[str] | None = None
    sections: list[TemplateSection]
    document_limits: TemplateLimits | None = None
    rules_id: str | None = None
    source_url: str = ""
    fetched_at: str
    unknown: list[str] = Field(default_factory=list)  # what the user has to fill in by hand
    citations: list[TemplateCitation] = Field(default_factory=list)
    # Why the result is weaker than asked for (generic fallback, scanned PDF, truncated documentation).
    warning: str | None = None
