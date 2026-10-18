"""POST /drafts tests. LLM is faked; startup (embedding index warm-up) is skipped
because TestClient is not used as a context manager."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import drafter
from backend.services.groups_repo import load_groups
from backend.services.llm import LLMError

QUERY = "Detekce cirkulujících nádorových buněk"
CURRENT = {"subject": "Spolupráce", "body": "Vážený pane profesore, ..."}


class FakeChat:
    name = "fake"

    def __init__(self) -> None:
        self.copilot_response: dict[str, Any] = {"reply": "Zkráceno.", "subject": None, "body": "Kratší text."}
        self.fail_for: set[str] = set()
        self.last_user: dict[str, Any] = {}

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        payload = json.loads(user)
        self.last_user = payload
        if "copilot" in system:
            return self.copilot_response
        if payload["group"]["name"] in self.fail_for:
            raise LLMError("boom")
        return dict(CURRENT)

    def complete_text(self, system: str, user: str) -> str:
        return ""


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeChat:
    fake = FakeChat()
    monkeypatch.setattr(drafter, "get_chat_client", lambda: fake)
    return fake


@pytest.fixture
def client(fake: FakeChat) -> TestClient:
    return TestClient(app)


@pytest.fixture
def groups():
    return load_groups()[:3]


def _post(client: TestClient, targets: list[dict], **extra: Any):
    return client.post("/drafts", json={"query": QUERY, "targets": targets, **extra})


def test_generate_single(client: TestClient, groups) -> None:
    r = _post(client, [{"group_slug": groups[0].slug}])
    assert r.status_code == 200, r.text
    [draft] = r.json()["drafts"]
    assert draft["recipient_name"] == groups[0].pi
    assert draft["subject"] == CURRENT["subject"] and draft["reply"] is None


def test_generate_batch_dedupes_and_passes_partners(client: TestClient, fake: FakeChat, groups) -> None:
    slugs = [g.slug for g in groups] + [groups[0].slug]
    body = _post(client, [{"group_slug": s} for s in slugs]).json()
    assert [d["group_slug"] for d in body["drafts"]] == [g.slug for g in groups]
    assert len(fake.last_user["partners"]) == 2


def test_unknown_group_is_404(client: TestClient) -> None:
    assert _post(client, [{"group_slug": "nope"}]).status_code == 404


def test_partial_batch_failure(client: TestClient, fake: FakeChat, groups) -> None:
    fake.fail_for = {groups[1].name}
    body = _post(client, [{"group_slug": g.slug} for g in groups]).json()
    assert len(body["drafts"]) == 2
    assert [e["group_slug"] for e in body["errors"]] == [groups[1].slug]


def test_all_failed_is_502(client: TestClient, fake: FakeChat, groups) -> None:
    fake.fail_for = {groups[0].name}
    assert _post(client, [{"group_slug": groups[0].slug}]).status_code == 502


def test_revise_with_instruction(client: TestClient, fake: FakeChat, groups) -> None:
    history = [{"role": "user", "content": "Ahoj"}, {"role": "assistant", "content": "Dobrý den"}]
    r = _post(
        client,
        [{"group_slug": groups[0].slug, "current": CURRENT, "history": history}],
        instruction="Zkrať to",
    )
    [draft] = r.json()["drafts"]
    assert draft["changed"] is True and draft["reply"] == "Zkráceno."
    assert draft["body"] == "Kratší text."
    assert draft["subject"] == CURRENT["subject"]  # null subject keeps the current one
    assert fake.last_user["history"] == history and fake.last_user["draft"] == CURRENT


def test_revise_question_keeps_draft(client: TestClient, fake: FakeChat, groups) -> None:
    fake.copilot_response = {"reply": "Je to v pořádku.", "subject": None, "body": None}
    r = _post(client, [{"group_slug": groups[0].slug, "current": CURRENT}], instruction="Je to formální?")
    [draft] = r.json()["drafts"]
    assert draft["changed"] is False and draft["body"] == CURRENT["body"]


def test_revise_without_reply_is_502(client: TestClient, fake: FakeChat, groups) -> None:
    fake.copilot_response = {"subject": "bez reply"}
    r = _post(client, [{"group_slug": groups[0].slug, "current": CURRENT}], instruction="Zkrať")
    assert r.status_code == 502


@pytest.mark.parametrize(
    ("target_extra", "extra"),
    [({}, {"instruction": "Zkrať"}), ({"current": CURRENT}, {})],
    ids=["instruction-without-current", "current-without-instruction"],
)
def test_inconsistent_mode_is_422(client: TestClient, groups, target_extra: dict, extra: dict) -> None:
    r = _post(client, [{"group_slug": groups[0].slug, **target_extra}], **extra)
    assert r.status_code == 422


TECH = "průtoková cytometrie"


def test_generate_technology_uses_tech_prompt(client: TestClient, fake: FakeChat, monkeypatch, groups) -> None:
    systems: list[str] = []
    original = fake.complete_json
    monkeypatch.setattr(fake, "complete_json", lambda system, user: systems.append(system) or original(system, user))
    r = _post(client, [{"group_slug": groups[0].slug, "technology": TECH}])
    [draft] = r.json()["drafts"]
    assert draft["technology"] == TECH and draft["recipient_name"] == groups[0].pi
    assert fake.last_user["technology"] == TECH
    assert "technologii" in systems[0] and "přístup" in systems[0]


def test_group_by_pi_name_dedupes_with_slug(client: TestClient, groups) -> None:
    body = _post(client, [{"group": groups[0].pi.upper()}, {"group": groups[0].slug}]).json()
    assert [d["group_slug"] for d in body["drafts"]] == [groups[0].slug]


def test_technology_alone_finds_the_lab(client: TestClient, fake: FakeChat) -> None:
    [draft] = _post(client, [{"technology": "ddPCR"}]).json()["drafts"]
    assert draft["group_slug"] == "drabek-jiri" and draft["technology"] == "ddPCR"
    assert "ddPCR" in " ".join(fake.last_user["group"]["expertise"])


def test_unknown_technology_is_404(client: TestClient) -> None:
    r = _post(client, [{"technology": "kvantová gravitace"}])
    assert r.status_code == 404 and "kvantová gravitace" in r.json()["detail"]


def test_target_needs_group_or_technology(client: TestClient) -> None:
    assert _post(client, [{"reason": "nic"}]).status_code == 422


def test_same_group_as_member_and_tech_provider(client: TestClient, fake: FakeChat, monkeypatch, groups) -> None:
    payloads: list[dict] = []
    original = fake.complete_json
    monkeypatch.setattr(fake, "complete_json", lambda system, user: payloads.append(json.loads(user)) or original(system, user))
    targets = [
        {"group": groups[0].slug},
        {"group": groups[1].pi},
        {"group": groups[2].slug, "technology": TECH},
        {"group": groups[0].slug, "technology": TECH},
    ]
    body = _post(client, targets).json()
    assert [(d["group_slug"], d["technology"]) for d in body["drafts"]] == [
        (groups[0].slug, None),
        (groups[1].slug, None),
        (groups[2].slug, TECH),
        (groups[0].slug, TECH),
    ]
    # Partners are team members only, never technology providers.
    by_group = {(p["group"]["name"], p["technology"] is not None): p["partners"] for p in payloads}
    assert [p["group"] for p in by_group[(groups[0].name, False)]] == [groups[1].name]
    assert [p["group"] for p in by_group[(groups[2].name, True)]] == [groups[0].name, groups[1].name]


def test_revise_technology_draft(client: TestClient, fake: FakeChat, groups) -> None:
    r = _post(client, [{"group": groups[0].slug, "technology": TECH, "current": CURRENT}], instruction="Zkrať")
    [draft] = r.json()["drafts"]
    assert draft["technology"] == TECH
    assert fake.last_user["context"]["technology"] == TECH


def test_swagger_examples_are_valid() -> None:
    from backend.schemas.drafts import DRAFT_REQUEST_EXAMPLES, DraftRequest

    for name, example in DRAFT_REQUEST_EXAMPLES.items():
        req = DraftRequest.model_validate(example["value"])
        assert all(drafter._resolve(t) for t in req.targets), name
