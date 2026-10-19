from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "EchoMind"
    assert data["tts_provider"] == "edge-tts"
    assert data["tts_voice"] == "en-US-JennyNeural"
    assert data["llm_mode"] in {"llm", "fact_retrieval"}


def test_health_hides_model_when_fact_retrieval(client: TestClient) -> None:
    # The shared `client` fixture runs without an API key.
    data = client.get("/health").json()
    assert data["llm_mode"] == "fact_retrieval"
    assert data["llm_model"] is None
    # Secrets must never be surfaced.
    assert "llm_api_key" not in data
