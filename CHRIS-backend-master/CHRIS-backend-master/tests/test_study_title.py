from fastapi.testclient import TestClient

from backend.main import app
from backend.services import study_title
from backend.services.study_title import generate_study_title

client = TestClient(app)


def test_study_title_endpoint_with_fallback(monkeypatch):
    # Short query fallback
    res = client.post("/study-title", json={"query": "Krátké"})
    assert res.status_code == 200
    assert "title" in res.json()
    assert len(res.json()["title"]) > 0


def test_study_title_endpoint_mock_llm(monkeypatch):
    class FakeChat:
        def complete_json(self, system: str, user: str):
            return {
                "title": "Trojský kůň pro glioblastom: Cílená nanoléčba rezistentních nádorů",
                "archetype": "04 THE METAPHOR",
                "alternatives": [
                    "Analýza zranitelnosti glioblastomu",
                    "Scan. Signal. Survival."
                ]
            }

    monkeypatch.setattr(study_title, "get_chat_client", lambda: FakeChat())

    res = client.post("/study-title", json={"query": "Vyvíjíme nanočástice pro proniknutí přes hematoencefalickou bariéru."})
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Trojský kůň pro glioblastom: Cílená nanoléčba rezistentních nádorů"
    assert data["archetype"] == "04 THE METAPHOR"
    assert len(data["alternatives"]) == 2


def test_generate_study_title_llm_error_fallback(monkeypatch):
    class FailingChat:
        def complete_json(self, system: str, user: str):
            raise RuntimeError("API timeout")

    monkeypatch.setattr(study_title, "get_chat_client", lambda: FailingChat())

    title = generate_study_title("Výzkum glioblastomu a jeho rezistence na chemoterapii. Druhá věta.")
    assert title == "Výzkum glioblastomu a jeho rezistence na chemoterapii"


def test_study_title_with_context(monkeypatch):
    captured_user = []

    class CapturingChat:
        def complete_json(self, system: str, user: str):
            captured_user.append(user)
            return {
                "title": "Nano-Targeted Therapy for Glioblastoma",
                "archetype": "01 THE BIG CLAIM",
                "alternatives": []
            }

    monkeypatch.setattr(study_title, "get_chat_client", lambda: CapturingChat())

    res = client.post(
        "/study-title",
        json={
            "query": "Výzkum glioblastomu",
            "context": ["Použití lipidových nanočástic", "Klinika s pacienty"]
        }
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Nano-Targeted Therapy for Glioblastoma"
    assert "Použití lipidových nanočástic" in captured_user[0]
    assert "Klinika s pacienty" in captured_user[0]
