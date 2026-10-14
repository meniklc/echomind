"""Supabase PostgREST adapter for EchoMind.

Uses the service-role key exclusively — never the anon key.
All queries are scoped by owner_id to enforce per-tenant isolation.
Falls back gracefully when SUPABASE_SERVICE_ROLE_KEY is not configured.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class SupabaseAdapter:
    """Thin wrapper around the Supabase PostgREST REST API.

    Uses only the service-role key so that RLS is bypassed and all operations
    are scoped programmatically by owner_id. The anon key is never used here.
    """

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @property
    def _base(self) -> str:
        return self._settings.supabase_url.rstrip("/") + "/rest/v1"

    @property
    def _headers(self) -> Dict[str, str]:
        key = self._settings.supabase_service_role_key
        return {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    @property
    def enabled(self) -> bool:
        return self._settings.supabase_configured

    @property
    def owner_id(self) -> str:
        return self._settings.primary_owner_id

    def _upsert_headers(self) -> Dict[str, str]:
        return {**self._headers, "Prefer": "resolution=ignore-duplicates,return=minimal"}

    def _return_repr_headers(self) -> Dict[str, str]:
        return {**self._headers, "Prefer": "return=representation"}

    # ------------------------------------------------------------------
    # Facts
    # ------------------------------------------------------------------

    async def upsert_fact(self, fact: Dict[str, Any]) -> bool:
        """Upsert a single fact row. Returns True on success."""
        if not self.enabled:
            return False
        row = {**fact, "owner_id": self.owner_id}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._base}/em_facts",
                    headers=self._upsert_headers(),
                    content=json.dumps(row, default=str),
                )
                if resp.status_code not in (200, 201):
                    logger.error("upsert_fact failed id=%s status=%s body=%s",
                                 fact.get("id"), resp.status_code, resp.text[:300])
                    return False
                return True
        except Exception as exc:
            logger.error("upsert_fact exception id=%s: %s", fact.get("id"), exc)
            return False

    async def upsert_conflict(self, conflict: Dict[str, Any]) -> bool:
        """Insert a conflict row (no update — conflicts are append-only)."""
        if not self.enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._base}/em_fact_conflicts",
                    headers=self._upsert_headers(),
                    content=json.dumps(conflict, default=str),
                )
                return resp.status_code in (200, 201)
        except Exception as exc:
            logger.error("upsert_conflict exception: %s", exc)
            return False

    async def get_verified_public_facts(self) -> List[Dict[str, Any]]:
        """Return verified + public facts for the configured owner.

        This is the only read path used by the public chat retrieval pipeline.
        Pending, rejected, and private facts are never returned.
        """
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base}/em_facts",
                    headers=self._headers,
                    params={
                        "owner_id": f"eq.{self.owner_id}",
                        "verification_status": "eq.verified",
                        "visibility": "eq.public",
                        "order": "import_date.desc",
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                logger.error("get_verified_public_facts status=%s", resp.status_code)
                return []
        except Exception as exc:
            logger.error("get_verified_public_facts exception: %s", exc)
            return []

    async def get_all_facts(self) -> List[Dict[str, Any]]:
        """Return all facts for the owner (all statuses). Admin use only."""
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base}/em_facts",
                    headers=self._headers,
                    params={
                        "owner_id": f"eq.{self.owner_id}",
                        "order": "import_date.desc",
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                return []
        except Exception as exc:
            logger.error("get_all_facts exception: %s", exc)
            return []

    async def get_pending_facts(self) -> List[Dict[str, Any]]:
        """Return pending-review facts for admin review."""
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base}/em_facts",
                    headers=self._headers,
                    params={
                        "owner_id": f"eq.{self.owner_id}",
                        "verification_status": "eq.pending_review",
                        "order": "import_date.desc",
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                return []
        except Exception as exc:
            logger.error("get_pending_facts exception: %s", exc)
            return []

    async def review_fact(
        self,
        fact_id: str,
        action: str,
        reviewer_id: str,
        note: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update verification_status for a fact. Returns updated row or None."""
        if not self.enabled:
            return None
        status = "verified" if action.lower() == "approve" else "rejected"
        patch = {
            "verification_status": status,
            "reviewed_by": reviewer_id,
            "review_note": note,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.patch(
                    f"{self._base}/em_facts",
                    headers=self._return_repr_headers(),
                    params={
                        "id": f"eq.{fact_id}",
                        "owner_id": f"eq.{self.owner_id}",  # safety: never update other owners
                    },
                    content=json.dumps(patch, default=str),
                )
                if resp.status_code == 200:
                    rows = resp.json()
                    return rows[0] if rows else None
                logger.error("review_fact status=%s body=%s", resp.status_code, resp.text[:200])
                return None
        except Exception as exc:
            logger.error("review_fact exception: %s", exc)
            return None

    async def get_ingestion_status(self) -> Dict[str, Any]:
        """Aggregate counts from em_facts for the status endpoint."""
        if not self.enabled:
            return {}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base}/em_facts",
                    headers={**self._headers, "Prefer": "count=exact", "Range": "0-0"},
                    params={"owner_id": f"eq.{self.owner_id}"},
                )
                total_range = resp.headers.get("content-range", "0/0")
                total = int(total_range.split("/")[-1]) if "/" in total_range else 0

                def _count(status: str) -> int:
                    r = client.get(
                        f"{self._base}/em_facts",
                        headers={**self._headers, "Prefer": "count=exact", "Range": "0-0"},
                        params={
                            "owner_id": f"eq.{self.owner_id}",
                            "verification_status": f"eq.{status}",
                        },
                    )
                    if r.status_code in (200, 206):
                        cr = r.headers.get("content-range", "0/0")
                        return int(cr.split("/")[-1]) if "/" in cr else 0
                    return 0

                verified = _count("verified")
                pending = _count("pending_review")
                return {"total": total, "verified": verified, "pending": pending}
        except Exception as exc:
            logger.error("get_ingestion_status exception: %s", exc)
            return {}

    # ------------------------------------------------------------------
    # Sessions / turns (backend-persisted server sessions)
    # ------------------------------------------------------------------

    async def save_turn(self, session_id: str, turn: Dict[str, Any]) -> bool:
        """Create or update a session, then insert the turn. Returns True on success."""
        if not self.enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Upsert session record first
                sess_row = {
                    "id": session_id,
                    "owner_id": self.owner_id,
                    "title": turn.get("content", "")[:48] if turn.get("role") == "user" else "Conversation",
                }
                await client.post(
                    f"{self._base}/em_sessions",
                    headers=self._upsert_headers(),
                    content=json.dumps(sess_row),
                )
                # Update session updated_at
                await client.patch(
                    f"{self._base}/em_sessions",
                    headers=self._headers,
                    params={"id": f"eq.{session_id}", "owner_id": f"eq.{self.owner_id}"},
                    content=json.dumps({"updated_at": turn.get("created_at")}),
                )

                # Insert turn
                turn_row = {
                    **turn,
                    "session_id": session_id,
                    "owner_id": self.owner_id,
                }
                resp = await client.post(
                    f"{self._base}/em_turns",
                    headers=self._upsert_headers(),
                    content=json.dumps(turn_row, default=str),
                )
                return resp.status_code in (200, 201)
        except Exception as exc:
            logger.error("save_turn exception: %s", exc)
            return False

    async def get_session_turns(self, session_id: str) -> List[Dict[str, Any]]:
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base}/em_turns",
                    headers=self._headers,
                    params={
                        "session_id": f"eq.{session_id}",
                        "owner_id": f"eq.{self.owner_id}",
                        "order": "created_at.asc",
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                return []
        except Exception as exc:
            logger.error("get_session_turns exception: %s", exc)
            return []

    async def list_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base}/em_sessions",
                    headers=self._headers,
                    params={
                        "owner_id": f"eq.{self.owner_id}",
                        "order": "updated_at.desc",
                        "limit": str(limit),
                    },
                )
                if resp.status_code == 200:
                    return resp.json()
                return []
        except Exception as exc:
            logger.error("list_sessions exception: %s", exc)
            return []


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_adapter: Optional[SupabaseAdapter] = None


def get_db(settings: Optional[Settings] = None) -> SupabaseAdapter:
    """Return the shared SupabaseAdapter singleton."""
    global _adapter
    if _adapter is None:
        _adapter = SupabaseAdapter(settings)
    return _adapter
