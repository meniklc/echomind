"""HTTP API routes for EchoMind."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.health import HealthResponse
from app.schemas.tts import TTSRequest
from app.services.chat import generate_chat_response
from app.services.knowledge import get_public_profile
from app.services.llm import get_llm_provider
from app.services.tts import TTSError, get_tts_provider

logger = logging.getLogger(__name__)

router = APIRouter()


def _settings(request: Request) -> Settings:
    return getattr(request.app.state, "settings", None) or get_settings()


@router.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        llm_mode="llm" if settings.llm_configured else "fact_retrieval",
        tts_provider="edge-tts",
    )


@router.get("/api/profile")
async def profile() -> JSONResponse:
    return JSONResponse(content=get_public_profile())


@router.post("/api/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    llm = getattr(request.app.state, "llm", None) or get_llm_provider(settings)
    return await generate_chat_response(
        question=body.question,
        history=body.history,
        settings=settings,
        llm=llm,
    )


@router.post("/api/tts")
async def tts(
    body: TTSRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> Response:
    max_chars = settings.tts_max_chars
    if len(body.text) > max_chars:
        raise HTTPException(
            status_code=422,
            detail=f"Text exceeds maximum length of {max_chars} characters.",
        )

    provider = getattr(request.app.state, "tts", None) or get_tts_provider(settings)
    try:
        audio = await provider.synthesize(body.text, voice=body.voice)
    except TTSError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'inline; filename="echomind.mp3"',
        },
    )
