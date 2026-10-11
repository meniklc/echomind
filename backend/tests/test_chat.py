from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import FakeLLM, FakeTTS


def test_chat_valid_question(client: TestClient) -> None:
    response = client.post("/api/chat", json={"question": "Tell me about yourself."})
    assert response.status_code == 200
    data = response.json()
    assert data["answer"]
    assert "EchoMind" in data["answer"] or "digital twin" in data["answer"].lower()
    assert data["mode"] == "fact_retrieval"
    assert data["status"] in {"ok", "insufficient_info"}


def test_chat_with_history(llm_client: TestClient) -> None:
    response = llm_client.post(
        "/api/chat",
        json={
            "question": "What technologies do you work with?",
            "history": [
                {"role": "user", "content": "Tell me about yourself."},
                {"role": "assistant", "content": "I am EchoMind."},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "llm"
    assert data["answer"] == "Fake LLM answer grounded in facts."


def test_chat_rejects_empty_question(client: TestClient) -> None:
    response = client.post("/api/chat", json={"question": "   "})
    assert response.status_code == 422


def test_chat_rejects_oversized_question(client: TestClient) -> None:
    response = client.post("/api/chat", json={"question": "x" * 1001})
    assert response.status_code == 422


def test_chat_unknown_topic_does_not_fabricate(client: TestClient) -> None:
    response = client.post(
        "/api/chat",
        json={"question": "Did you win a Nobel Prize in quantum computing?"},
    )
    assert response.status_code == 200
    answer = response.json()["answer"].lower()
    assert "nobel" not in answer or "not" in answer or "placeholder" in answer or "enough" in answer or "yet" in answer


def test_chat_llm_failure_falls_back(settings) -> None:
    app = create_app()
    app.state.settings = settings
    app.state.llm = FakeLLM(fail=True)
    app.state.tts = FakeTTS()
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"question": "What projects have you built?"})
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "fact_retrieval"
    assert "unavailable" in data["answer"].lower() or "fact retrieval" in data["answer"].lower()


def test_chat_project_question_includes_reference(client: TestClient) -> None:
    response = client.post("/api/chat", json={"question": "Tell me about PhishCure"})
    assert response.status_code == 200
    data = response.json()
    labels = [ref["label"].lower() for ref in data.get("references", [])]
    assert any("phish" in label for label in labels) or "phishcure" in data["answer"].lower()
