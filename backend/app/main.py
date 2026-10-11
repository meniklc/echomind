"""EchoMind FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.services.llm import get_llm_provider
from app.services.tts import get_tts_provider


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    settings = getattr(app.state, "settings", None) or get_settings()
    app.state.settings = settings
    if getattr(app.state, "llm", None) is None:
        app.state.llm = get_llm_provider(settings)
    if getattr(app.state, "tts", None) is None:
        app.state.tts = get_tts_provider(settings)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
