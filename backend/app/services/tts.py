"""Text-to-speech provider abstraction using edge-tts."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

import edge_tts

from app.core.config import Settings

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """Raised when speech synthesis fails."""


class BaseTTSProvider(ABC):
    provider_name: str

    @abstractmethod
    async def synthesize(self, text: str, voice: Optional[str] = None) -> bytes:
        raise NotImplementedError


class EdgeTTSProvider(BaseTTSProvider):
    provider_name = "edge-tts"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def synthesize(self, text: str, voice: Optional[str] = None) -> bytes:
        cleaned = text.strip()
        if not cleaned:
            raise TTSError("Text is empty.")
        if len(cleaned) > self.settings.tts_max_chars:
            raise TTSError(
                f"Text exceeds the maximum of {self.settings.tts_max_chars} characters."
            )

        selected_voice = (voice or self.settings.tts_voice).strip() or self.settings.tts_voice
        tmp_path: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            communicate = edge_tts.Communicate(
                cleaned,
                selected_voice,
                rate=self.settings.tts_rate,
            )
            await asyncio.wait_for(
                communicate.save(str(tmp_path)),
                timeout=self.settings.tts_timeout_seconds,
            )
            audio = tmp_path.read_bytes()
            if not audio:
                raise TTSError("TTS produced empty audio.")
            return audio
        except asyncio.TimeoutError as exc:
            logger.warning("edge-tts timed out")
            raise TTSError("Speech synthesis timed out. Please try again.") from exc
        except TTSError:
            raise
        except Exception as exc:  # noqa: BLE001 — surface as safe TTS failure
            logger.warning("edge-tts failed: %s", exc)
            raise TTSError(
                "Speech synthesis is temporarily unavailable. Captions remain available."
            ) from exc
        finally:
            if tmp_path is not None:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    logger.debug("Could not remove temp audio file %s", tmp_path)


def get_tts_provider(settings: Settings) -> BaseTTSProvider:
    return EdgeTTSProvider(settings)
