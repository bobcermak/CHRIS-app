"""Clarification ("doptávání"): follow-up questions when the initial prompt is incomplete.

Stateless — the client sends the prompt, composer context and every finished
round (questions + answers); the backend returns the next round, or `ready=True`
together with a `brief` that is fed into POST /match.

Shapes mirror the frontend contract (`ClarifyRound`, `ClarifyQuestion`,
`ClarifyAnswer`, `Slot`) so the client can use them as-is.
"""

from typing import Literal

from pydantic import BaseModel, Field

QuestionKind = Literal["single_choice", "multi_choice", "free_text", "yes_no", "confirm_assumption"]
Priority = Literal["must", "nice"]
CallId = Literal["AZV", "GACR", "TACR", "HORIZON", "unknown"]

# The LLM decides when it knows enough; this is only a safety stop against loops.
MAX_ROUNDS = 6
MAX_QUESTIONS = 3


class OwnGroup(BaseModel):
    orcid: str | None = None
    name: str | None = None


class ClarifyContext(BaseModel):
    """Structured context the user already gave in the composer ("+" menu)."""

    call: CallId | None = None
    own_group: OwnGroup | None = None


class QuestionOption(BaseModel):
    id: str
    label: str
    hint: str | None = None


class ClarifyQuestion(BaseModel):
    id: str
    slot_key: str
    kind: QuestionKind
    text: str
    why: str
    placeholder: str | None = None
    options: list[QuestionOption] | None = None
    suggested: str | list[str] | None = None
    allow_skip: Literal[True] = True


class ClarifyAnswer(BaseModel):
    question_id: str
    value: str | list[str] | None = None
    unknown: bool = False


class AnsweredRound(BaseModel):
    questions: list[ClarifyQuestion]
    answers: list[ClarifyAnswer]


class Slot(BaseModel):
    key: str
    value: str | list[str] | int | None = None
    priority: Priority = "nice"
    confidence: float = Field(default=0.5, ge=0, le=1)
    assumed: bool = False


class MatchBrief(BaseModel):
    """Everything POST /match needs, distilled from the prompt + answers."""

    query: str
    # None = let the AI decide; set only when the researcher stated it.
    team_size: int | None = Field(default=None, ge=2, le=6)
    nodes: list[str] = Field(default_factory=list)
    exclude_slugs: list[str] = Field(default_factory=list)


class ClarifyRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=4000)
    context: ClarifyContext = Field(default_factory=ClarifyContext)
    history: list[AnsweredRound] = Field(default_factory=list, max_length=MAX_ROUNDS + 1)
    # "Přeskočit a hledat hned" — no more questions, just distil the brief.
    finish: bool = False


class ClarifyResponse(BaseModel):
    round: int
    ready: bool
    questions: list[ClarifyQuestion]
    reason: str | None = None
    title: str
    summary: str
    slots: list[Slot]
    readiness: float = Field(ge=0, le=1)
    brief: MatchBrief
    warning: str | None = None
