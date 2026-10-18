"""Dynamic team size: the AI plans as many roles as needed, picks a fitting group per
role from its candidates (a group may cover two roles), and roles nobody fits become
gaps. LLM, vector search, grants and technologies are faked."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.schemas.match import MAX_TEAM_SIZE, Role
from backend.services import _team_steps, team_assembler
from backend.services._team_steps import (
    Candidate,
    assemble_team,
    parse_role_plan,
    select_team,
    size_rule,
)
from backend.services.groups_repo import load_groups
from backend.services.llm import LLMError


@pytest.fixture
def slugs() -> list[str]:
    return [g.slug for g in load_groups()[:4]]


def _role(name: str, priority: str = "must") -> Role:
    return Role(name=name, description=f"{name} popis", priority=priority)  # type: ignore[arg-type]


# ---- plan --------------------------------------------------------------------------------


def test_size_rule_is_a_cap_or_ai_decides() -> None:
    assert "nejvýš 3" in size_rule(3)
    assert f"nikdy víc než {MAX_TEAM_SIZE}" in size_rule(None)


def test_parse_role_plan_sorts_must_first_and_caps() -> None:
    raw = {
        "team_rationale": "Stačí dva.",
        "roles": [
            {"name": "A", "description": "a", "priority": "nice"},
            {"name": "B", "description": "b", "priority": "must"},
            {"name": "C", "description": "c", "priority": "???"},  # unknown → must
            {"name": "D"},  # invalid, dropped
        ],
    }
    roles, rationale = parse_role_plan(raw, team_size=2)
    assert [r.name for r in roles] == ["B", "C"] and rationale == "Stačí dva."
    roles, _ = parse_role_plan({"roles": [{"name": str(i), "description": "x"} for i in range(9)]}, None)
    assert len(roles) == MAX_TEAM_SIZE


def test_parse_role_plan_without_roles_raises() -> None:
    with pytest.raises(LLMError):
        parse_role_plan({"roles": []}, None)


# ---- assemble ----------------------------------------------------------------------------


def test_one_group_can_cover_two_roles_but_not_three(slugs: list[str]) -> None:
    a, b = slugs[:2]
    roles = [_role("R1"), _role("R2"), _role("R3")]
    cands = {
        "R1": [Candidate(a, 0.9)],
        "R2": [Candidate(a, 0.9), Candidate(b, 0.8)],
        "R3": [Candidate(a, 0.9), Candidate(b, 0.8)],
    }
    team, gaps = assemble_team(roles, cands)
    assert [(m.group.slug, m.role.name, [r.name for r in m.also_covers]) for m in team] == [
        (a, "R1", ["R2"]),
        (b, "R3", []),
    ]
    assert gaps == []


def test_role_without_candidates_is_a_gap(slugs: list[str]) -> None:
    team, gaps = assemble_team([_role("R1"), _role("R2")], {"R1": [Candidate(slugs[0], 0.9)], "R2": []})
    assert len(team) == 1 and [g.role.name for g in gaps] == ["R2"]


# ---- review ------------------------------------------------------------------------------


class FakeChat:
    name = "fake"

    def __init__(self, response: dict[str, Any] | None = None) -> None:
        self.response = response or {}
        self.calls: list[tuple[str, dict[str, Any] | str]] = []

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        try:
            payload: dict[str, Any] | str = json.loads(user)
        except json.JSONDecodeError:
            payload = user
        self.calls.append((system, payload))
        if callable(self.response):
            return self.response(system, payload)
        return self.response

    def complete_text(self, system: str, user: str) -> str:
        return ""


def test_select_picks_from_candidates_and_turns_misses_into_gaps(
    slugs: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b, c, d = slugs[:4]
    roles = [_role("R1"), _role("R2"), _role("R3"), _role("R4", "nice"), _role("R5"), _role("R6")]
    cands = {
        "R1": [Candidate(a, 0.9), Candidate(b, 0.8)],
        "R2": [Candidate(b, 0.9)],
        "R3": [Candidate(c, 0.9)],
        "R4": [Candidate(b, 0.7)],
        "R5": [Candidate(a, 0.6)],
        "R6": [Candidate(a, 0.6)],
    }
    fake = FakeChat(
        {
            "assignments": [
                {"role": "R1", "slug": b, "reason": "Druhý kandidát sedí líp."},
                {"role": "R2", "slug": b, "reason": "Také B."},
                {"role": "R3", "slug": None, "reason": "Nikdo nemá kliniku."},
                {"role": "R4", "slug": b, "reason": "Třetí role pro B."},  # over the per-group cap
                {"role": "R5", "slug": d, "reason": "Není mezi kandidáty."},  # never shown → gap
                {"role": "R6", "slug": c, "reason": "Kandidát jiné role."},  # shown for R3 → accepted
            ],
            "team_summary": "  B přinese klinická data.  ",
        }
    )
    monkeypatch.setattr(_team_steps, "get_chat_client", lambda: fake)
    monkeypatch.setattr(_team_steps, "score_group_against", lambda desc, slug: 0.42)
    team, gaps, summary = select_team("projekt", roles, cands)
    assert summary == "B přinese klinická data."
    assert [(m.group.slug, m.role.name, m.score, m.reason, [r.name for r in m.also_covers]) for m in team] == [
        (b, "R1", 0.8, "Druhý kandidát sedí líp.", ["R2"]),
        (c, "R6", 0.42, "Kandidát jiné role.", []),
    ]
    assert [g.role.name for g in gaps] == ["R3", "R4", "R5"]
    assert gaps[0].reason == "Nikdo nemá kliniku."
    sent = fake.calls[0][1]
    assert isinstance(sent, dict)
    assert sent["roles"][0]["candidates"] == [a, b] and set(sent["groups"]) == {a, b, c}


def test_select_without_assignments_raises(slugs: list[str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_team_steps, "get_chat_client", lambda: FakeChat({"oops": 1}))
    with pytest.raises(LLMError):
        select_team("projekt", [_role("R1")], {"R1": [Candidate(slugs[0], 0.9)]})


# ---- /match end to end ---------------------------------------------------------------------


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, slugs: list[str]) -> tuple[TestClient, FakeChat]:
    a, b = slugs[:2]

    def respond(system: str, payload: Any) -> dict[str, Any]:
        if isinstance(payload, str):  # role plan gets plain text
            return {
                "team_rationale": "Stačí dvě skupiny.",
                "roles": [
                    {"name": "Klinika", "description": "k", "priority": "must", "why": "pacienti"},
                    {"name": "Omika", "description": "o", "priority": "must", "why": "data"},
                    {"name": "Statistika", "description": "s", "priority": "nice", "why": "analýza"},
                ],
            }
        return {
            "assignments": [
                {"role": "Klinika", "slug": a, "reason": "Kohorta."},
                {"role": "Omika", "slug": None, "reason": "Nemá sekvenování."},
                {"role": "Statistika", "slug": b, "reason": "Biostatistik."},
            ],
            "team_summary": "Klinika a statistika, chybí omika.",
        }

    fake = FakeChat(respond)  # type: ignore[arg-type]
    monkeypatch.setattr(team_assembler, "get_chat_client", lambda: fake)
    monkeypatch.setattr(_team_steps, "get_chat_client", lambda: fake)
    monkeypatch.setattr(team_assembler, "recommend_technologies", lambda q, k: [])
    monkeypatch.setattr(team_assembler, "match_grants", lambda q, k: [])
    cands = {"Klinika": [Candidate(a, 0.9)], "Omika": [Candidate(b, 0.8)], "Statistika": [Candidate(b, 0.7)]}
    monkeypatch.setattr(team_assembler, "gather_candidates", lambda roles, **kw: cands)
    return TestClient(app), fake


def test_match_without_team_size_lets_ai_decide(client: tuple[TestClient, FakeChat], slugs: list[str]) -> None:
    http, fake = client
    r = http.post("/match", json={"query": "Rezistence na imunoterapii u NSCLC."})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "Počet rolí urči sám" in fake.calls[0][0]
    assert body["team_rationale"] == "Stačí dvě skupiny."
    assert body["team_summary"] == "Klinika a statistika, chybí omika."
    assert [(m["group"]["slug"], m["role"]["name"]) for m in body["team"]] == [(slugs[0], "Klinika"), (slugs[1], "Statistika")]
    assert [(g["role"]["name"], g["role"]["priority"], g["reason"]) for g in body["gaps"]] == [
        ("Omika", "must", "Nemá sekvenování.")
    ]


def test_match_team_size_is_an_upper_limit(client: tuple[TestClient, FakeChat]) -> None:
    http, fake = client
    body = http.post("/match", json={"query": "Rezistence na imunoterapii u NSCLC.", "team_size": 2}).json()
    assert "nejvýš 2" in fake.calls[0][0]
    assert [r["name"] for r in body["role_plan"]] == ["Klinika", "Omika"]
