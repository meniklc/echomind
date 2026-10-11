"""Pytest fixtures for EchoMind backend tests."""

from __future__ import annotations

from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.llm import BaseLLMProvider, FactRetrievalProvider
from app.services.tts import BaseTTSProvider, TTSError


class FakeLLM(BaseLLMProvider):
    mode = "llm"

    def __init__(self, answer: str = "Fake LLM answer grounded in facts.", fail: bool = False) -> None:
        self.answer = answer
        self.fail = fail
        self.calls = 0

    async def generate(self, question, facts, history=None):
        self.calls += 1
        if self.fail:
            from app.services.llm import LLMError

            raise LLMError("Simulated LLM failure")
        return self.answer


class FakeTTS(BaseTTSProvider):
    provider_name = "fake-tts"

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls = 0

    async def synthesize(self, text: str, voice: Optional[str] = None) -> bytes:
        self.calls += 1
        if self.fail:
            raise TTSError("Simulated TTS failure")
        # Minimal fake MP3-ish bytes for content-type tests
        return b"ID3" + text.encode("utf-8")[:200]


@pytest.fixture
def settings() -> Settings:
    return Settings(
        CORS_ORIGINS="http://localhost:5173,http://testserver",
        LLM_API_KEY="",
        LLM_BASE_URL="https://example.test/v1",
        LLM_MODEL="test-model",
        TTS_VOICE="en-US-JennyNeural",
        TTS_MAX_CHARS=1200,
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    app = create_app()
    app.state.settings = settings
    app.state.llm = FactRetrievalProvider()
    app.state.tts = FakeTTS()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def llm_client(settings: Settings) -> TestClient:
    app = create_app()
    settings_with_key = settings.model_copy(update={"llm_api_key": "test-key"})
    app.state.settings = settings_with_key
    app.state.llm = FakeLLM()
    app.state.tts = FakeTTS()
    with TestClient(app) as test_client:
        yield test_client
