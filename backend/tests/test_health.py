from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "EchoMind"
    assert data["tts_provider"] == "edge-tts"
    assert data["llm_mode"] in {"llm", "fact_retrieval"}
