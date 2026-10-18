"""Outreach drafts: e-mails to a matched NÚVR group (its PI) — either inviting it
into the project team, or asking its lab for access to a technology it runs.

Stateless — one LLM round-trip per target, nothing is stored. The client keeps
the drafts (and any manual edits / undo history) and calls the same endpoint
again with `instruction` + `current` to let the copilot revise them.
"""

from typing import Literal

from pydantic import AliasChoices, BaseModel, Field, model_validator

from backend.schemas.match import Role

Language = Literal["cs", "en"]
Tone = Literal["formal", "neutral", "friendly"]

MAX_BATCH = 10
MAX_HISTORY = 50


class Sender(BaseModel):
    """Who is writing the e-mail. Optional — LLM uses [placeholders] when missing."""

    name: str = Field(..., min_length=1, max_length=200)
    affiliation: str = Field(default="", max_length=300)
    email: str = Field(default="", max_length=200)


class Email(BaseModel):
    subject: str = Field(..., min_length=1, max_length=300)
    body: str = Field(..., min_length=1, max_length=20000)


class CopilotTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=4000)


class DraftTarget(BaseModel):
    """One recipient — just name it; the backend fills in the rest from the NÚVR data.

    - `group` — slug, group name or PI name ("Jiří Homola"). Also accepted as `group_slug`.
    - `technology` — technology name ("ddPCR"). The e-mail then asks the lab for access
      to it instead of inviting the group into the team. Without `group`, the lab is
      found by the technology.
    - `role`, `reason` — optional extra context (e.g. straight from a MatchResult member).
    """

    group: str | None = Field(
        default=None, min_length=1, max_length=300, validation_alias=AliasChoices("group", "group_slug")
    )
    technology: str | None = Field(default=None, min_length=1, max_length=300)
    role: Role | None = None
    reason: str = Field(default="", max_length=2000)
    # Revision mode only: the draft as the user currently has it + prior copilot turns.
    current: Email | None = None
    history: list[CopilotTurn] = Field(default_factory=list, max_length=MAX_HISTORY)

    @model_validator(mode="after")
    def _has_recipient(self) -> "DraftTarget":
        if self.group is None and self.technology is None:
            raise ValueError("Give `group` (slug / name / PI), `technology`, or both.")
        return self


class DraftRequest(BaseModel):
    query: str = Field(..., min_length=5, max_length=4000)
    targets: list[DraftTarget] = Field(..., min_length=1, max_length=MAX_BATCH)
    sender: Sender | None = None
    language: Language = "cs"
    tone: Tone = "formal"
    # Set → revise every target's `current` draft by this instruction; unset → generate fresh drafts.
    instruction: str | None = Field(default=None, min_length=1, max_length=4000)

    @model_validator(mode="after")
    def _mode_is_consistent(self) -> "DraftRequest":
        has_current = [t.current is not None for t in self.targets]
        if self.instruction is not None and not all(has_current):
            raise ValueError("With `instruction`, every target needs `current`.")
        if self.instruction is None and any(has_current):
            raise ValueError("`current` is only used together with `instruction`.")
        return self


class Draft(BaseModel):
    group_slug: str
    group_name: str
    recipient_name: str
    recipient_email: str = ""
    role: Role | None = None
    technology: str | None = None
    subject: str
    body: str
    # Revision mode only: copilot's answer to the instruction, and whether the e-mail changed.
    reply: str | None = None
    changed: bool = True


class DraftError(BaseModel):
    group_slug: str
    technology: str | None = None
    detail: str


class DraftResponse(BaseModel):
    drafts: list[Draft]
    # Per-target failures in a batch; the request still succeeds if at least one draft was made.
    errors: list[DraftError] = Field(default_factory=list)


# Swagger "Examples" dropdown for POST /drafts. Just names — context comes from data/groups.json.
_QUERY = (
    "Chci vyvinout neinvazivní test pro včasnou detekci kolorektálního karcinomu "
    "z tekuté biopsie (cfDNA + cirkulující proteiny) a ověřit ho na pacientských vzorcích."
)
_SENDER = {"name": "Mgr. Jana Nováková", "affiliation": "Masarykova univerzita, LF", "email": "jana.novakova@example.cz"}
_CURRENT = {
    "subject": "Nabídka spolupráce: detekce kolorektálního karcinomu z tekuté biopsie",
    "body": "Vážený pane profesore,\n\njmenuji se Jana Nováková a připravuji projekt ...\n\nS pozdravem\nJana Nováková",
}

DRAFT_REQUEST_EXAMPLES = {
    "team": {
        "summary": "Tým — jen jména skupin / PI",
        "value": {"query": _QUERY, "targets": [{"group": "Ondřej Slabý"}, {"group": "Jiří Homola"}, {"group": "hajduch-marian"}]},
    },
    "technology": {
        "summary": "Technologie — jen název, laboratoř se dohledá",
        "value": {"query": _QUERY, "targets": [{"technology": "ddPCR"}, {"technology": "hmotnostní spektrometrie"}]},
    },
    "technology_at_group": {
        "summary": "Technologie u konkrétní skupiny",
        "value": {"query": _QUERY, "targets": [{"group": "Jan Škoda", "technology": "průtoková cytometrie"}]},
    },
    "team_and_technology": {
        "summary": "Tým + technologie najednou, s odesílatelem",
        "description": "Technologické e-maily zmiňují členy týmu jako partnery; poskytovatelé technologií partnery nejsou.",
        "value": {
            "query": _QUERY,
            "targets": [{"group": "Ondřej Slabý"}, {"group": "Jiří Homola"}, {"technology": "ddPCR"}],
            "sender": _SENDER,
        },
    },
    "english": {
        "summary": "Anglicky, přátelský tón",
        "value": {"query": _QUERY, "targets": [{"technology": "HDX-MS"}], "language": "en", "tone": "friendly"},
    },
    "revise": {
        "summary": "Copilot — úprava e-mailu",
        "value": {
            "query": _QUERY,
            "targets": [{"group": "Ondřej Slabý", "current": _CURRENT}],
            "instruction": "Zkrať to na polovinu a přidej návrh termínu hovoru příští týden.",
        },
    },
}
