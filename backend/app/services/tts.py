import asyncio
import logging
import re
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Optional

import edge_tts

from app.core.config import Settings

logger = logging.getLogger(__name__)

# Pronunciation and abbreviation map for natural speech
PRONUNCIATION_MAP = [
    (re.compile(r"\bAI/ML\b", re.IGNORECASE), "A I, M L"),
    (re.compile(r"\bFastAPI\b"), "Fast A P I"),
    (re.compile(r"\bUVCE\b"), "U V C E"),
    (re.compile(r"\bB\.Tech\b", re.IGNORECASE), "B Tech"),
    (re.compile(r"\bCSE\b"), "C S E"),
    (re.compile(r"\bLLMs\b"), "L L M's"),
    (re.compile(r"\bLLM\b"), "L L M"),
    (re.compile(r"\bRAG\b"), "rag"),
    (re.compile(r"\bVLMs\b"), "V L M's"),
    (re.compile(r"\bVLM\b"), "V L M"),
    (re.compile(r"\bOCR\b"), "O C R"),
    (re.compile(r"\bSOC\b"), "sock"),
    (re.compile(r"\bCVE\b"), "C V E"),
    (re.compile(r"\bAPIs\b"), "A P I's"),
    (re.compile(r"\bAPI\b"), "A P I"),
    (re.compile(r"\bRBAC\b"), "R-back"),
    (re.compile(r"\bURLs\b"), "U R L's"),
    (re.compile(r"\bURL\b"), "U R L"),
    (re.compile(r"\bSQL\b"), "sequel"),
    (re.compile(r"\bPostgreSQL\b"), "Post-gres Q L"),
    (re.compile(r"\bGitHub\b"), "Git Hub"),
]

AVAILABLE_VOICES: List[Dict[str, str]] = [
    {"id": "en-US-JennyNeural", "name": "Jenny (US English, Expressive Female)", "locale": "en-US"},
    {"id": "en-US-GuyNeural", "name": "Guy (US English, Natural Male)", "locale": "en-US"},
    {"id": "en-US-AndrewMultilingualNeural", "name": "Andrew (US Multilingual Male)", "locale": "en-US"},
    {"id": "en-US-BrianMultilingualNeural", "name": "Brian (US Multilingual Male)", "locale": "en-US"},
    {"id": "en-IN-PrabhatNeural", "name": "Prabhat (Indian English, Professional Male)", "locale": "en-IN"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja (Indian English, Professional Female)", "locale": "en-IN"},
]


def prepare_text_for_speech(text: str) -> str:
    """Transform markdown response into naturally pronounced speech text."""
    if not text:
        return ""

    clean = text

    # Strip code blocks
    clean = re.sub(r"```[\s\S]*?```", " ", clean)
    # Strip inline code
    clean = re.sub(r"`([^`]+)`", r"\1", clean)
    # Strip markdown links [text](url) -> text
    clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)
    # Strip bold / italics
    clean = re.sub(r"(\*\*|__)(.*?)\1", r"\2", clean)
    clean = re.sub(r"(\*|_)(.*?)\1", r"\2", clean)
    # Strip headers
    clean = re.sub(r"^#{1,6}\s+", "", clean, flags=re.MULTILINE)
    # Strip bullet indicators
    clean = re.sub(r"^[\s*•-]+\s+", "", clean, flags=re.MULTILINE)
    # Strip citations like [1], [2]
    clean = re.sub(r"\[\d+\]", "", clean)
    # Strip emoji symbols
    clean = re.sub(r"[\U00010000-\U0010ffff]", "", clean)
    clean = re.sub(r"[📌✨⚡🎯🔗🚀👤💼📜🎙️💬⌨️👁️]", "", clean)
    # Remove 'Verified Sources:' footer if present in prompt
    clean = re.sub(r"Verified Sources:.*$", "", clean, flags=re.IGNORECASE | re.DOTALL)

    # Apply technical pronunciation expansions
    for pattern, replacement in PRONUNCIATION_MAP:
        clean = pattern.sub(replacement, clean)

    # Normalize whitespace and paragraph pauses
    clean = re.sub(r"\n\s*\n", ", ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()

    return clean


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
        # Normalize and pronounce speech text
        cleaned = prepare_text_for_speech(text)
        if not cleaned:
            raise TTSError("Text is empty.")
        if len(cleaned) > self.settings.tts_max_chars:
            cleaned = cleaned[:self.settings.tts_max_chars]

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
        except Exception as exc:  # noqa: BLE001
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


def get_available_voices() -> List[Dict[str, str]]:
    return AVAILABLE_VOICES

