"""Deep search schemas. Perplexity-backed enrichment for a single entity.

The output shape mirrors what Perplexity naturally produces (markdown narrative
+ list of source URLs), so no extra LLM round-trips are needed to post-process
into a different format. FE renders `summary` with a markdown library and
`citations` as a separate "Zdroje" section.
"""

from typing import Literal

from pydantic import BaseModel, Field


class Citation(BaseModel):
    url: str
    title: str = ""


class GroupDeepRequest(BaseModel):
    slug: str = Field(..., min_length=1)


class GrantDeepRequest(BaseModel):
    slug: str = Field(..., min_length=1)


class TechnologyDeepRequest(BaseModel):
    name: str = Field(..., min_length=2)
    description: str = Field(..., min_length=10)


class DeepSearchResult(BaseModel):
    entity_type: Literal["group", "grant", "technology"]
    ref: str                              # slug for group/grant, name for technology
    summary: str                          # Perplexity markdown narrative
    citations: list[Citation] = Field(default_factory=list)
    generated_at: str                     # ISO timestamp
    warning: str | None = None
