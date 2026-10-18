"""POST /clarify tests. LLM is faked; startup (embedding warm-up) is skipped."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import clarifier
from backend.services.groups_repo import load_groups
from backend.services.llm import LLMError

PROMPT = "Chceme studovat nádorové mikroprostředí mozkových metastáz."


def _llm_round(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "title": "Mikroprostředí mozkových metastáz",
        "summary": "Studium mikroprostředí.",
        "slots": [{"key": "cancer_type", "value": "mozkové metastázy", "priority": "must", "confidence": 0.9, "assumed": False}],
        "readiness": 0.4,
        "reason": "Chybí, co přesně chcete zjistit.",
        "questions": [
            {"slot_key": "research_question", "kind": "free_text", "text": "Co chcete zjistit?", "why": "Zpřesní hledání.", "placeholder": "např. …"},
            {
                "slot_key": "study_material",
                "kind": "multi_choice",
                "text": "Na čem?",
                "why": "Klinika vs. laboratoř.",
                "options": [{"id": "Tkan", "label": "Tkáň"}, {"id": "krev", "label": "Krev"}],
                "suggested": ["Tkan"],
            },
            {"slot_key": "primary_origin", "kind": "confirm_assumption", "text": "Jde o metastázy z plic?", "why": "Ověření."},
            {"slot_key": "project_stage", "kind": "single_choice", "text": "Fáze?", "why": "x", "options": [{"id": "a", "label": "nápad"}]},
        ],
        "brief": "Rozšířený popis projektu pro vyhledávání.",
        "team_size": 9,
        "nodes": ["praha", "Mars"],
        "own_group": None,
    }
    base.update(over)
    return base


class FakeChat:
    name = "fake"

    def __init__(self) -> None:
        self.response: dict[str, Any] = _llm_round()
        self.fail = False
        self.last_user: dict[str, Any] = {}

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        self.last_user = json.loads(user)
        if self.fail:
            raise LLMError("boom")
        return self.response

    def complete_text(self, system: str, user: str) -> str:
        return ""


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeChat:
    fake = FakeChat()
    monkeypatch.setattr(clarifier, "get_chat_client", lambda: fake)
    return fake


@pytest.fixture
def client(fake: FakeChat) -> TestClient:
    return TestClient(app)


def test_first_round_normalises_questions(client: TestClient) -> None:
    r = client.post("/clarify", json={"prompt": PROMPT})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["round"] == 1 and body["ready"] is False and body["readiness"] == 0.4
    qs = body["questions"]
    assert len(qs) == 3  # capped
    assert [q["id"] for q in qs] == ["r1-research-question", "r1-study-material", "r1-primary-origin"]
    assert qs[1]["options"][0]["id"] == "tkan" and qs[1]["suggested"] == ["tkan"]
    assert qs[2]["kind"] == "confirm_assumption" and [o["id"] for o in qs[2]["options"]] == ["ano", "ne"]
    assert body["brief"]["team_size"] == 6 and body["brief"]["nodes"] == ["Praha"]


def test_choice_with_one_option_becomes_free_text(client: TestClient, fake: FakeChat) -> None:
    fake.response = _llm_round(questions=_llm_round()["questions"][3:4])
    [q] = client.post("/clarify", json={"prompt": PROMPT}).json()["questions"]
    assert q["kind"] == "free_text" and q["options"] is None


def test_no_questions_when_llm_knows_enough(client: TestClient, fake: FakeChat) -> None:
    fake.response = _llm_round(questions=[], readiness=0.9)
    body = client.post("/clarify", json={"prompt": PROMPT}).json()
    assert body["round"] == 1 and body["ready"] is True
    assert body["questions"] == [] and body["readiness"] == 1.0 and body["reason"] is None


def test_history_answers_are_sent_as_labels_and_not_reasked(client: TestClient, fake: FakeChat) -> None:
    first = client.post("/clarify", json={"prompt": PROMPT}).json()
    answers = [
        {"question_id": "r1-research-question", "value": "Jak imunitní buňky podporují růst"},
        {"question_id": "r1-study-material", "value": ["tkan"]},
        {"question_id": "r1-primary-origin", "value": None, "unknown": True},
    ]
    body = client.post(
        "/clarify", json={"prompt": PROMPT, "history": [{"questions": first["questions"], "answers": answers}]}
    ).json()
    sent = fake.last_user["history"][0]
    assert sent[1]["answer"] == ["Tkáň"] and sent[2]["answer"] is None
    assert body["round"] == 2
    # everything the fake LLM proposes was asked already (incl. the "Nevím" one) except project_stage
    assert [q["slot_key"] for q in body["questions"]] == ["project_stage"]


def test_only_repeats_means_ready(client: TestClient, fake: FakeChat) -> None:
    first = client.post("/clarify", json={"prompt": PROMPT}).json()
    fake.response = _llm_round(questions=_llm_round()["questions"][:1])
    history = [{"questions": first["questions"], "answers": []}]
    body = client.post("/clarify", json={"prompt": PROMPT, "history": history}).json()
    assert body["ready"] is True and body["questions"] == []


def test_safety_stop_after_max_rounds(client: TestClient, fake: FakeChat) -> None:
    history = [{"questions": [], "answers": []}] * clarifier.MAX_ROUNDS
    body = client.post("/clarify", json={"prompt": PROMPT, "history": history}).json()
    assert body["ready"] is True and fake.last_user["ask"] is False


def test_finish_never_asks(client: TestClient, fake: FakeChat) -> None:
    body = client.post("/clarify", json={"prompt": PROMPT, "finish": True}).json()
    assert body["ready"] is True and body["questions"] == []
    assert fake.last_user["ask"] is False
    assert body["brief"]["query"] == "Rozšířený popis projektu pro vyhledávání."


def test_llm_failure_skips_clarification_and_keeps_answers(client: TestClient, fake: FakeChat) -> None:
    fake.fail = True
    q = {"id": "r1-x", "slot_key": "research_question", "kind": "free_text", "text": "Co chcete zjistit?", "why": "."}
    history = [{"questions": [q], "answers": [{"question_id": "r1-x", "value": "Mechanismus rezistence"}]}]
    body = client.post("/clarify", json={"prompt": PROMPT, "history": history}).json()
    assert body["warning"] and body["ready"] is True and body["questions"] == []
    assert body["brief"]["query"].startswith(PROMPT)
    assert "Co chcete zjistit? Mechanismus rezistence" in body["brief"]["query"]


def test_own_group_resolves_to_slug(client: TestClient, fake: FakeChat) -> None:
    g = load_groups()[0]
    fake.response = _llm_round(own_group=g.pi)
    body = client.post("/clarify", json={"prompt": PROMPT}).json()
    assert g.slug in body["brief"]["exclude_slugs"]


def test_llm_saying_it_knows_enough_stops_asking(client: TestClient, fake: FakeChat) -> None:
    fake.response = _llm_round(readiness=clarifier.READY_THRESHOLD)  # still proposes questions
    body = client.post("/clarify", json={"prompt": PROMPT}).json()
    assert body["ready"] is True and body["questions"] == []


def test_llm_error_is_retried_once(client: TestClient, fake: FakeChat, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}
    real = fake.complete_json

    def flaky(system: str, user: str) -> dict[str, Any]:
        calls["n"] += 1
        if calls["n"] == 1:
            raise LLMError("truncated")
        return real(system, user)

    monkeypatch.setattr(fake, "complete_json", flaky)
    body = client.post("/clarify", json={"prompt": PROMPT}).json()
    assert calls["n"] == 2 and body["warning"] is None and body["questions"]
