from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import FakeTTS


def test_tts_returns_mpeg(client: TestClient) -> None:
    response = client.post("/api/tts", json={"text": "Hello from EchoMind."})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.content.startswith(b"ID3")


def test_tts_rejects_empty(client: TestClient) -> None:
    response = client.post("/api/tts", json={"text": "  "})
    assert response.status_code == 422


def test_tts_failure_returns_503(settings) -> None:
    app = create_app()
    app.state.settings = settings
    app.state.tts = FakeTTS(fail=True)
    with TestClient(app) as client:
        response = client.post("/api/tts", json={"text": "This should fail."})
    assert response.status_code == 503
    assert "detail" in response.json()


def test_tts_oversized_text(client: TestClient) -> None:
    response = client.post("/api/tts", json={"text": "y" * 1201})
    assert response.status_code == 422
