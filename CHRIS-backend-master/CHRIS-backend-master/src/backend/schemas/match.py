from typing import Literal

from pydantic import BaseModel, Field, model_validator

from backend.models.domain import Grant, Group

# Team size is decided by the AI (as many groups as the project needs). Hard bounds:
# - MAX: select_team sends ~MAX_TEAM_SIZE × PER_ROLE_CANDIDATES profiles in one LLM call.
# - MIN: a "team" of one is just a solo recommendation; always offer a collaborator.
MIN_TEAM_SIZE = 2
MAX_TEAM_SIZE = 4


class Role(BaseModel):
    name: str
    description: str
    # must = the project cannot go without it; nice = helps. Uncovered `must` roles are the key gaps.
    priority: Literal["must", "nice"] = "must"
    why: str = ""  # one sentence: why the project needs this role


class TeamMember(BaseModel):
    role: Role
    group: Group
    score: float
    reason: str = ""
    # Further roles the same group covers (one group can fill up to two roles).
    also_covers: list[Role] = Field(default_factory=list)


class Gap(BaseModel):
    """A role no NÚVR group fits well enough — left empty instead of forcing a weak match."""

    role: Role
    reason: str


class GrantMatch(BaseModel):
    grant: Grant
    score: float


class TechnologyProvider(BaseModel):
    """One NÚVR group that has a given technology, with where to find it."""

    group_slug: str
    group_name: str
    pi: str
    node: str
    faculties: list[str]
    score: float
    evidence: str  # top expertise lines from the group backing the match


class Technology(BaseModel):
    """A research technology / method proposed by the LLM, plus NÚVR providers."""

    name: str
    description: str
    providers: list[TechnologyProvider]
    infrastructures: list[str] = Field(default_factory=list)


class MatchRequest(BaseModel):
    query: str = Field(..., min_length=5)
    context: str | list[str] | None = Field(default=None, description="Doplňující informace z doptávání nebo upřesňující odpovědi.")
    # None = the AI decides how many groups the project needs; a number is an upper limit.
    team_size: int | None = Field(default=None, ge=2, le=MAX_TEAM_SIZE)
    grants_top_k: int = Field(default=5, ge=0, le=15)
    tech_top_k: int = Field(default=4, ge=0, le=8)
    # From POST /clarify's `brief`: the user's own group is never proposed;
    # groups in preferred nodes get a small ranking bonus (soft, not a hard filter).
    exclude_slugs: list[str] = Field(default_factory=list)
    nodes: list[str] = Field(default_factory=list)


class StudyTitleRequest(BaseModel):
    query: str = Field(..., min_length=3, description="Popis výzkumného záměru nebo studie.")
    context: str | list[str] | None = Field(default=None, description="Doplňující informace, odpovědi z doptávání nebo upřesňující kontext.")


class StudyTitleResponse(BaseModel):
    title: str = Field(..., description="Vhodný akademický název studie.")
    archetype: str | None = Field(default=None, description="Použitý princip z metodiky (např. THE BIG CLAIM, THE METAPHOR).")
    alternatives: list[str] = Field(default_factory=list, description="Alternativní chytlavé názvy podle dalších principů.")


class MatchResult(BaseModel):
    query: str
    title: str = ""
    role_plan: list[Role]
    team: list[TeamMember]
    gaps: list[Gap] = Field(default_factory=list)
    team_rationale: str = ""  # why this many roles (from planning, before groups are picked)
    team_summary: str = ""  # what the picked team brings together (from the group profiles)
    grants: list[GrantMatch] = Field(default_factory=list)
    technologies: list[Technology] = Field(default_factory=list)
    warning: str | None = None


class GrantOption(BaseModel):
    """One of several alternative team compositions, each sculpted to the rules of a specific grant."""

    grant: Grant
    grant_score: float
    grant_fit: str
    role_plan: list[Role]
    team: list[TeamMember]
    gaps: list[Gap] = Field(default_factory=list)
    team_rationale: str = ""
    team_summary: str = ""


class GrantFirstRequest(BaseModel):
    query: str = Field(..., min_length=5)
    context: str | list[str] | None = Field(default=None, description="Doplňující informace z doptávání")
    top_grants: int = Field(default=3, ge=1, le=5)
    # None = the AI decides (within the grant's rules); a number is an upper limit.
    team_size: int | None = Field(default=None, ge=2, le=MAX_TEAM_SIZE)
    tech_top_k: int = Field(default=4, ge=0, le=8)


class GrantFirstResult(BaseModel):
    query: str
    title: str = ""
    grant_options: list[GrantOption]
    technologies: list[Technology] = Field(default_factory=list)
    warning: str | None = None


class RefineMember(BaseModel):
    """One finalized team slot in a refine request: user has picked both the role
    text and the exact group that fills it. The backend does no searching."""

    role_name: str = Field(..., min_length=1)
    role_description: str = Field(..., min_length=10)
    group_slug: str = Field(..., min_length=1)


class RefineRequest(BaseModel):
    query: str = Field(..., min_length=5)
    members: list[RefineMember] = Field(..., min_length=1)
    grants_top_k: int = Field(default=5, ge=0, le=15)
    tech_top_k: int = Field(default=4, ge=0, le=8)

    @model_validator(mode="after")
    def _unique_slugs(self) -> "RefineRequest":
        slugs = [m.group_slug for m in self.members]
        if len(slugs) != len(set(slugs)):
            raise ValueError("members contain duplicate group_slug")
        return self
