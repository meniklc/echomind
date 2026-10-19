from fastapi.testclient import TestClient

from app.main import create_app
from app.services.tts import (
    DEFAULT_TTS_VOICE,
    EdgeTTSProvider,
    resolve_voice,
)
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


# ---------------------------------------------------------------------------
# Voice configuration
# ---------------------------------------------------------------------------


def test_default_voice_is_female_english() -> None:
    assert DEFAULT_TTS_VOICE == "en-US-JennyNeural"


def test_resolve_voice_keeps_valid_voice() -> None:
    assert resolve_voice("en-IN-NeerjaNeural") == "en-IN-NeerjaNeural"
    assert resolve_voice("en-US-AriaNeural") == "en-US-AriaNeural"


def test_resolve_voice_falls_back_when_missing_or_invalid() -> None:
    assert resolve_voice(None) == DEFAULT_TTS_VOICE
    assert resolve_voice("") == DEFAULT_TTS_VOICE
    assert resolve_voice("   ") == DEFAULT_TTS_VOICE
    assert resolve_voice("not a voice id!") == DEFAULT_TTS_VOICE


def test_provider_applies_default_when_configured_voice_invalid(settings, monkeypatch) -> None:
    captured = {}

    class FakeCommunicate:
        def __init__(self, text, voice, rate=None):
            captured["voice"] = voice

        async def save(self, path):
            with open(path, "wb") as handle:
                handle.write(b"ID3audio")

    monkeypatch.setattr("app.services.tts.edge_tts.Communicate", FakeCommunicate)
    invalid = settings.model_copy(update={"tts_voice": "definitely-not-valid"})
    provider = EdgeTTSProvider(invalid)

    import asyncio

    audio = asyncio.run(provider.synthesize("Hello there."))

    assert audio == b"ID3audio"
    assert captured["voice"] == DEFAULT_TTS_VOICE


def test_tts_voices_endpoint_reports_default(client: TestClient) -> None:
    response = client.get("/api/tts/voices")
    assert response.status_code == 200
    data = response.json()
    assert data["default"] == DEFAULT_TTS_VOICE
    assert any(v["id"] == DEFAULT_TTS_VOICE for v in data["voices"])
