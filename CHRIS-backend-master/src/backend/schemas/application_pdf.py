"""PDF export of an application draft (POST /application/pdf).

Stateless like the copilot: the client sends the application as it has it and gets an A4 PDF
back. Section text is the markdown subset users and the copilot write (paragraphs, `#`
headings, `-`/`*`/`•` and `1.` lists, **bold**, *italic*).
"""

from pydantic import BaseModel, Field

MAX_SECTIONS = 40


class PdfSection(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content_md: str = Field(default="", max_length=60_000)


class ApplicationPdfRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    # Line above the title, e.g. "AZV ČR · standardní projekt · Program …".
    subtitle: str = Field(default="", max_length=400)
    sections: list[PdfSection] = Field(min_length=1, max_length=MAX_SECTIONS)
    # Footer notices — the "AI-assisted draft" one is always added by the backend.
    notices: list[str] = Field(default_factory=list, max_length=5)
