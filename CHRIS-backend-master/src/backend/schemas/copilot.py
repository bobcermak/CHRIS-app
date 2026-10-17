"""Application copilot (ARCHITECTURE §9.4, §9.4.1) — a strict panel reviewer of the whole
application that also helps with it.

One persona, two requests:
  - `oppose` (default) — reviews the whole application: formal checks (deterministic)
    + panel-style objections ordered by severity, a per-criterion score, and an answer
    to the user's `instruction` when there is one (the copilot chat).
  - `write` — drafts one section (`section_key`). Still the opponent: the draft comes
    with its weakest points and what the user must supply.

Stateless — the client sends the application as it has it (sections, template, team)
and keeps the drafts, history and the user's edits.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from backend.schemas.templates import Agency, Language, TemplateLimits, TemplateStatus

CopilotMode = Literal["oppose", "write"]
Severity = Literal["blocker", "warning", "suggestion", "info"]

MAX_SECTIONS = 40
MAX_TEAM = 10
MAX_HISTORY = 20


class CopilotSection(BaseModel):
    key: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=300)
    required: bool = True
    hint: str = Field(default="", max_length=600)
    content: str = Field(default="", max_length=60_000)
    limits: TemplateLimits | None = None
    # False = a section of a non-verified template the user hasn't confirmed against the call.
    confirmed: bool = True


class CopilotTemplate(BaseModel):
    status: TemplateStatus = "generic"
    agency: Agency = "OTHER"
    scheme: str = Field(default="", max_length=300)
    language: Language = "cs"
    document_limits: TemplateLimits | None = None
    unknown: list[str] = Field(default_factory=list, max_length=20)


class CopilotTeamMember(BaseModel):
    """A group in the team — slug, group name or PI; the profile comes from data/groups.json."""

    group: str = Field(min_length=1, max_length=300)
    role: str = Field(default="", max_length=300)


class CopilotTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class CopilotRequest(BaseModel):
    mode: CopilotMode = "oppose"
    # write: the section to draft · oppose: optional focus of the review.
    section_key: str | None = Field(default=None, max_length=60)
    # The user's message in the copilot chat (question or request).
    instruction: str | None = Field(default=None, min_length=1, max_length=4000)
    project: str = Field(min_length=5, max_length=6000, description="The researcher's project description.")
    title: str = Field(default="", max_length=300)
    grant: str | None = Field(default=None, max_length=200, description="Grant slug (data/grants.json).")
    template: CopilotTemplate = Field(default_factory=CopilotTemplate)
    sections: list[CopilotSection] = Field(min_length=1, max_length=MAX_SECTIONS)
    team: list[CopilotTeamMember] = Field(default_factory=list, max_length=MAX_TEAM)
    history: list[CopilotTurn] = Field(default_factory=list, max_length=MAX_HISTORY)

    @model_validator(mode="after")
    def _consistent(self) -> "CopilotRequest":
        keys = [s.key for s in self.sections]
        if len(set(keys)) != len(keys):
            raise ValueError("Section keys must be unique.")
        if self.section_key is not None and self.section_key not in keys:
            raise ValueError(f"Unknown section_key {self.section_key!r}.")
        if self.mode == "write" and self.section_key is None:
            raise ValueError("`write` needs `section_key`.")
        return self


class CopilotComment(BaseModel):
    id: str
    section_key: str = ""  # "" = the application as a whole
    mode: CopilotMode
    severity: Severity
    text: str
    # Rule / evaluation criterion the objection rests on (from the template or the call).
    criterion: str | None = None
    # Exact passage of the section that `suggested_edit` replaces; None = append to the section.
    quote: str | None = None
    suggested_edit: str | None = None


class ScoreCriterion(BaseModel):
    name: str
    score: int = Field(ge=0)
    max: int = Field(gt=0)
    reason: str


class CopilotScore(BaseModel):
    total: int = Field(ge=0, le=100)  # sum of criteria normalised to 0–100
    criteria: list[ScoreCriterion]
    # True = the call's own criteria weren't available; general ones were used.
    general_criteria: bool = False


class SectionPatch(BaseModel):
    section_key: str
    content_md: str


class CopilotResult(BaseModel):
    comments: list[CopilotComment] = Field(default_factory=list)
    score: CopilotScore | None = None
    section_patch: SectionPatch | None = None
    # Direct answer to `instruction` (the chat); None without an instruction.
    reply: str | None = None
