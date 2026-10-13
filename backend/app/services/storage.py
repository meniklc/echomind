"""Durable storage adapter supporting Supabase PostgREST with seamless local fallback."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

LOCAL_SESSIONS_FILE = Path(__file__).resolve().parent.parent / "knowledge" / "sessions.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StorageAdapter:
    """Hybrid storage: writes to Supabase if configured, otherwise local JSON."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.supabase_url = getattr(self.settings, "supabase_url", "")
        self.supabase_key = getattr(self.settings, "supabase_key", "")

    @property
    def is_supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    async def save_turn(
        self,
        session_id: str,
        role: str,
        content: str,
        mode: Optional[str] = None,
        references: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Save a conversation turn to durable storage."""
        now = _now_iso()
        turn_data = {
            "id": f"turn-{int(datetime.now().timestamp() * 1000)}",
            "session_id": session_id,
            "role": role,
            "content": content,
            "mode": mode,
            "references": references or [],
            "created_at": now,
        }

        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {
                        "apikey": self.supabase_key,
                        "Authorization": f"Bearer {self.supabase_key}",
                        "Content-Type": "application/json",
                        "Prefer": "return=representation",
                    }
                    endpoint = f"{self.supabase_url.rstrip('/')}/rest/v1/turns"
                    resp = await client.post(endpoint, headers=headers, json=turn_data)
                    if resp.status_code in (200, 201):
                        return turn_data
            except Exception as exc:
                logger.warning("Supabase turn save failed, using local fallback: %s", exc)

        # Local storage fallback
        self._local_save_turn(session_id, turn_data)
        return turn_data

    async def get_session_turns(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieve all turns for a given session."""
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {
                        "apikey": self.supabase_key,
                        "Authorization": f"Bearer {self.supabase_key}",
                    }
                    endpoint = (
                        f"{self.supabase_url.rstrip('/')}/rest/v1/turns"
                        f"?session_id=eq.{session_id}&order=created_at.asc"
                    )
                    resp = await client.get(endpoint, headers=headers)
                    if resp.status_code == 200:
                        return resp.json()
            except Exception as exc:
                logger.warning("Supabase get turns failed, using local fallback: %s", exc)

        return self._local_get_turns(session_id)

    async def list_recent_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """List recent conversation sessions."""
        if self.is_supabase_enabled:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {
                        "apikey": self.supabase_key,
                        "Authorization": f"Bearer {self.supabase_key}",
                    }
                    endpoint = (
                        f"{self.supabase_url.rstrip('/')}/rest/v1/sessions"
                        f"?order=updated_at.desc&limit={limit}"
                    )
                    resp = await client.get(endpoint, headers=headers)
                    if resp.status_code == 200:
                        return resp.json()
            except Exception as exc:
                logger.warning("Supabase list sessions failed, using local fallback: %s", exc)

        return self._local_list_sessions()

    # -------------------------------------------------------------------------
    # Local JSON Storage Helpers
    # -------------------------------------------------------------------------

    def _load_local_data(self) -> Dict[str, Any]:
        if not LOCAL_SESSIONS_FILE.exists():
            return {"sessions": {}, "turns": []}
        try:
            return json.loads(LOCAL_SESSIONS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {"sessions": {}, "turns": []}

    def _save_local_data(self, data: Dict[str, Any]) -> None:
        try:
            LOCAL_SESSIONS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not write to local sessions file: %s", exc)

    def _local_save_turn(self, session_id: str, turn: Dict[str, Any]) -> None:
        data = self._load_local_data()
        sessions = data.setdefault("sessions", {})
        turns = data.setdefault("turns", [])

        # Auto-title session if new
        if session_id not in sessions:
            title = turn["content"][:48] if turn["role"] == "user" else "Conversation"
            sessions[session_id] = {
                "id": session_id,
                "title": title,
                "created_at": turn["created_at"],
                "updated_at": turn["created_at"],
            }
        else:
            sessions[session_id]["updated_at"] = turn["created_at"]

        turns.append(turn)
        self._save_local_data(data)

    def _local_get_turns(self, session_id: str) -> List[Dict[str, Any]]:
        data = self._load_local_data()
        turns = data.get("turns", [])
        return [t for t in turns if t.get("session_id") == session_id]

    def _local_list_sessions(self) -> List[Dict[str, Any]]:
        data = self._load_local_data()
        sessions = list(data.get("sessions", {}).values())
        sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
        return sessions


_storage_instance: Optional[StorageAdapter] = None


def get_storage_adapter(settings: Optional[Settings] = None) -> StorageAdapter:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = StorageAdapter(settings)
    return _storage_instance
