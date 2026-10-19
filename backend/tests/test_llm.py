"""Deterministic LLM client tests (no live provider calls).

Every test mocks the HTTP transport, so the suite never consumes a paid/free
provider quota and never requires a real API key.
"""

from __future__ import annotations

import json
from typing import Any, Callable, List

import httpx
import pytest

from app.core.config import Settings
from app.services import llm as llm_module
from app.services.llm import (
    FactRetrievalProvider,
    LLMError,
    OpenAICompatibleProvider,
    get_llm_provider,
)

Handler = Callable[[httpx.Request], httpx.Response]


def _install_transport(monkeypatch: pytest.MonkeyPatch, handler: Handler) -> None:
    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def factory(*_args: Any, **_kwargs: Any) -> httpx.AsyncClient:
        return real_client(transport=transport)

    monkeypatch.setattr(llm_module.httpx, "AsyncClient", factory)


def _settings(**overrides: Any) -> Settings:
    base = dict(
        LLM_API_KEY="test-key",
        LLM_BASE_URL="https://provider.test/v1",
        LLM_MODEL="primary-model",
        LLM_FALLBACK_MODELS="fallback-model",
    )
    base.update(overrides)
    return Settings(**base)


def _ok_response(content: str = "Grounded answer.") -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"role": "assistant", "content": content}}]},
    )


def _model_not_found(model: str) -> httpx.Response:
    return httpx.Response(
        404,
        json={
            "error": {
                "message": f"The model `{model}` does not exist",
                "code": "model_not_found",
            }
        },
    )


# ---------------------------------------------------------------------------
# Success path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_success_returns_content(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: List[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["model"])
        return _ok_response("Hello from the model.")

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    answer = await provider.generate("Who are you?", {"sections": {}}, [])

    assert answer == "Hello from the model."
    assert provider.mode == "llm"
    assert seen == ["primary-model"]


@pytest.mark.asyncio
async def test_llm_sends_auth_header_and_bounded_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization")
        payload = json.loads(request.content)
        captured["roles"] = [m["role"] for m in payload["messages"]]
        captured["last"] = payload["messages"][-1]["content"]
        return _ok_response()

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    history = [{"role": "user", "content": "x" * 9000}] * 12
    await provider.generate("New question?", {"sections": {}}, history)

    assert captured["auth"] == "Bearer test-key"
    # System prompt + facts + bounded history + question.
    assert captured["roles"][0] == "system"
    assert captured["last"] == "New question?"
    # History is capped at 8 turns and each turn at 1500 chars.
    assert captured["roles"].count("user") <= 1 + 8


# ---------------------------------------------------------------------------
# Model retirement self-healing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_model_not_found_falls_back_to_next_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested: List[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        model = json.loads(request.content)["model"]
        requested.append(model)
        if model == "primary-model":
            return _model_not_found(model)
        return _ok_response(f"Answered by {model}.")

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    answer = await provider.generate("Explain your projects.", {"sections": {}}, [])

    assert answer == "Answered by fallback-model."
    assert requested == ["primary-model", "fallback-model"]


@pytest.mark.asyncio
async def test_llm_all_models_unavailable_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _model_not_found(json.loads(request.content)["model"])

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError):
        await provider.generate("Who are you?", {"sections": {}}, [])


# ---------------------------------------------------------------------------
# Failure paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_401_raises_auth_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "invalid key"}})

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError, match="Authentication"):
        await provider.generate("Who are you?", {"sections": {}}, [])


@pytest.mark.asyncio
async def test_llm_429_raises_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "slow down"}})

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError, match="rate limit"):
        await provider.generate("Who are you?", {"sections": {}}, [])


@pytest.mark.asyncio
async def test_llm_timeout_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out", request=request)

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError, match="timed out"):
        await provider.generate("Who are you?", {"sections": {}}, [])


@pytest.mark.asyncio
async def test_llm_network_error_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError):
        await provider.generate("Who are you?", {"sections": {}}, [])


@pytest.mark.asyncio
async def test_llm_malformed_json_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not json", headers={"content-type": "text/plain"})

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError):
        await provider.generate("Who are you?", {"sections": {}}, [])


@pytest.mark.asyncio
async def test_llm_empty_answer_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _ok_response("   ")

    _install_transport(monkeypatch, handler)
    provider = OpenAICompatibleProvider(_settings())

    with pytest.raises(LLMError, match="empty"):
        await provider.generate("Who are you?", {"sections": {}}, [])


# ---------------------------------------------------------------------------
# Provider selection & model candidates
# ---------------------------------------------------------------------------


def test_provider_selection_without_key_uses_fact_retrieval() -> None:
    provider = get_llm_provider(_settings(LLM_API_KEY=""))
    assert isinstance(provider, FactRetrievalProvider)
    assert provider.mode == "fact_retrieval"


def test_provider_selection_with_key_uses_openai_compatible() -> None:
    provider = get_llm_provider(_settings())
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.mode == "llm"


def test_model_candidates_are_ordered_and_deduplicated() -> None:
    settings = _settings(
        LLM_MODEL="openai/gpt-oss-20b",
        LLM_FALLBACK_MODELS="openai/gpt-oss-20b, openai/gpt-oss-120b , ",
    )
    assert settings.llm_model_candidates == ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]


def test_model_candidates_default_when_empty() -> None:
    settings = _settings(LLM_MODEL="   ", LLM_FALLBACK_MODELS="")
    assert settings.llm_model_candidates == ["openai/gpt-oss-20b"]
