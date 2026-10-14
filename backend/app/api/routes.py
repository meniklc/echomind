"""HTTP API routes for EchoMind."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse

from app.core.auth import require_owner
from app.core.config import Settings, get_settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.health import HealthResponse
from app.schemas.ingestion import (
    AdminReviewRequest,
    FactItem,
    FactVerificationStatus,
    GitHubSyncRequest,
    IngestionResult,
    IngestionStatusResponse,
)
from app.schemas.tts import TTSRequest
from app.services.chat import generate_chat_response
from app.services.ingestion import (
    extract_text_from_file,
    get_ingestion_status,
    load_ingested_facts,
    parse_linkedin_export,
    review_fact,
    store_and_reindex_facts,
    sync_github_profile,
)
from app.services.knowledge import get_public_profile
from app.services.llm import get_llm_provider
from app.services.tts import TTSError, get_available_voices, get_tts_provider

logger = logging.getLogger(__name__)

router = APIRouter()
admin_router = APIRouter(
    prefix="/api/admin",
    dependencies=[Depends(require_owner)],
)


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


@router.get("/api/tts/voices")
async def list_tts_voices() -> JSONResponse:
    """List available and configurable voices for Edge TTS."""
    return JSONResponse(content={"voices": get_available_voices()})


# =========================================================================
# Admin Knowledge Ingestion & Sync Endpoints
# =========================================================================

@admin_router.get("/auth/me")
async def admin_identity() -> JSONResponse:
    """Confirm that the current authenticated user is authorized as the owner."""
    return JSONResponse(content={"authenticated": True})


@admin_router.post("/ingest/github", response_model=IngestionResult)
async def ingest_github(
    body: GitHubSyncRequest,
    _settings: Settings = Depends(get_settings),
) -> IngestionResult:
    """Sync repositories and documentation from the public GitHub profile."""
    facts = await sync_github_profile(
        username=body.username,
        token=body.token,
        include_readmes=body.include_readmes,
    )
    result = store_and_reindex_facts(facts)
    result.source = f"github:{body.username}"
    return result


@admin_router.post("/ingest/file", response_model=IngestionResult)
async def ingest_file(
    file: UploadFile = File(...),
    _settings: Settings = Depends(get_settings),
) -> IngestionResult:
    """Import and normalize resume or project files (PDF, DOCX, TXT, MD, JSON)."""
    filename = file.filename or "uploaded_document.txt"
    content_bytes = await file.read()
    raw_text = extract_text_from_file(filename, content_bytes)

    if not raw_text.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Could not extract readable text from '{filename}'. Please check file format.",
        )

    # Check if LinkedIn export
    lower_text = raw_text.lower()
    if "linkedin" in filename.lower() or "experience" in lower_text and "education" in lower_text:
        facts = parse_linkedin_export(raw_text, filename)
    else:
        # Wrap as generic verified/reviewed document chunk
        from datetime import datetime, timezone
        facts = [
            FactItem(
                id=f"doc-{int(datetime.now(timezone.utc).timestamp())}",
                entity_type="document",
                title=f"Uploaded Document: {filename}",
                content=raw_text[:4000],
                source="resume_file",
                source_url_or_file=filename,
                import_date=datetime.now(timezone.utc).isoformat(),
                verification_status=FactVerificationStatus.PENDING_REVIEW,
            )
        ]

    result = store_and_reindex_facts(facts)
    result.source = f"file:{filename}"
    return result


@admin_router.post("/ingest/linkedin", response_model=IngestionResult)
async def ingest_linkedin(
    file: UploadFile = File(...),
    _settings: Settings = Depends(get_settings),
) -> IngestionResult:
    """Import LinkedIn profile export without scraping or external API abuse."""
    filename = file.filename or "linkedin_export.pdf"
    content_bytes = await file.read()
    raw_text = extract_text_from_file(filename, content_bytes)

    if not raw_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the provided LinkedIn export.",
        )

    facts = parse_linkedin_export(raw_text, filename)
    result = store_and_reindex_facts(facts)
    result.source = f"linkedin:{filename}"
    return result


@admin_router.get("/ingest/status", response_model=IngestionStatusResponse)
async def ingestion_status() -> IngestionStatusResponse:
    """Get current status of ingested facts, sources, and verification status."""
    return get_ingestion_status()


@admin_router.get("/ingest/pending", response_model=List[FactItem])
async def list_pending_facts() -> List[FactItem]:
    """List facts requiring administrative review before inclusion."""
    all_facts = load_ingested_facts()
    return [f for f in all_facts if f.verification_status == FactVerificationStatus.PENDING_REVIEW]


@admin_router.post("/ingest/review")
async def review_pending_fact(
    body: AdminReviewRequest,
) -> JSONResponse:
    """Admin review step: approve or reject a pending fact."""
    reviewed = review_fact(body.fact_id, body.action, body.note)
    if not reviewed:
        raise HTTPException(status_code=404, detail="Fact not found in ledger.")
    return JSONResponse(
        content={
            "status": "ok",
            "fact_id": reviewed.id,
            "verification_status": reviewed.verification_status.value,
        }
    )
