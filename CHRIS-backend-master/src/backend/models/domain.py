from pydantic import BaseModel, Field


class Group(BaseModel):
    """A NÚVR research group (named after its PI). Shape matches data/groups.json."""

    slug: str
    name: str
    pi: str
    url: str
    email: str = ""
    website: str = ""
    photo_url: str = ""  # PI portrait on nuvr.cz ("" when the page has none)
    node: str = ""
    faculties: list[str] = Field(default_factory=list)
    programs: list[str] = Field(default_factory=list)
    mission: str = ""
    vision: str = ""
    focus: str = ""
    publications: list[str] = Field(default_factory=list)
    expertise: list[str] = Field(default_factory=list)
    collaborations: list[str] = Field(default_factory=list)
    infrastructures: list[str] = Field(default_factory=list)


class Grant(BaseModel):
    """A funding opportunity relevant to NÚVR research. Hand-curated for the demo —
    real pipeline would scrape ISVAVAI (CZ) + EU Funding & Tenders.

    `description` is the main semantic signal for embedding search; the structured
    fields are for display and filtering.
    """

    slug: str
    title: str
    agency: str          # AZV ČR, GA ČR, TA ČR, EU Horizon Europe, EU4Health, …
    programme: str = ""  # e.g. "Mission on Cancer", "Cluster 1 Health", "OP JAK"
    call_id: str = ""
    url: str = ""
    deadline: str = ""   # ISO date; "" if rolling / unknown
    budget: str = ""     # free-text, e.g. "max 15 M Kč / projekt"
    duration: str = ""   # free-text, e.g. "3–5 let"
    description: str = ""
    keywords: list[str] = Field(default_factory=list)
    eligible_applicants: str = ""
