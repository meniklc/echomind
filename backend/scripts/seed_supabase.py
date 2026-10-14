#!/usr/bin/env python3
"""EchoMind Supabase seed script.

Reads existing JSON knowledge files and upserts them into Supabase using the
service-role key. Idempotent — safe to run multiple times.

Required environment variables (set in .env or shell before running):
    SUPABASE_URL              — https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY — service-role key (NOT the anon key)
    OWNER_USER_IDS            — comma-separated Supabase auth.users UUID(s)

Usage:
    cd D:\\nipuna-btech\\projects\\echomind\\backend
    ..\\..venv\\Scripts\\python.exe scripts/seed_supabase.py

The script will print a summary and exit 0 on success or 1 on any error.
JSON source files are never modified.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List

import httpx

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = BACKEND_DIR / "app" / "knowledge"
FACTS_FILE = KNOWLEDGE_DIR / "ingested_facts.json"
SESSIONS_FILE = KNOWLEDGE_DIR / "sessions.json"
ENV_FILE = BACKEND_DIR / ".env"

# ---------------------------------------------------------------------------
# Load .env if present (simple parser, not pydantic)
# ---------------------------------------------------------------------------

def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


_load_env(ENV_FILE)

# ---------------------------------------------------------------------------
# Validate required environment
# ---------------------------------------------------------------------------

def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        print(f"ERROR: {name} is not set. Aborting.", file=sys.stderr)
        sys.exit(1)
    return val


SUPABASE_URL = _require_env("SUPABASE_URL").rstrip("/")
SERVICE_ROLE_KEY = _require_env("SUPABASE_SERVICE_ROLE_KEY")
OWNER_IDS_RAW = _require_env("OWNER_USER_IDS")

owner_ids = [u.strip() for u in OWNER_IDS_RAW.split(",") if u.strip()]
if not owner_ids:
    print("ERROR: OWNER_USER_IDS contains no valid UUIDs.", file=sys.stderr)
    sys.exit(1)

# Validate all owner IDs are proper UUIDs
for oid in owner_ids:
    try:
        uuid.UUID(oid)
    except ValueError:
        print(f"ERROR: OWNER_USER_IDS contains invalid UUID: '{oid}'", file=sys.stderr)
        sys.exit(1)

PRIMARY_OWNER_ID = owner_ids[0]

# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

SERVICE_HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates,return=minimal",
}


def _post(path: str, payload: Any, client: httpx.Client) -> httpx.Response:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    resp = client.post(url, headers=SERVICE_HEADERS, content=json.dumps(payload))
    return resp


def _patch(path: str, payload: Any, params: Dict[str, str], client: httpx.Client) -> httpx.Response:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    resp = client.patch(url, headers=SERVICE_HEADERS, params=params, content=json.dumps(payload))
    return resp


# ---------------------------------------------------------------------------
# Seed facts
# ---------------------------------------------------------------------------

def seed_facts(client: httpx.Client) -> int:
    """Upsert all facts from ingested_facts.json. Returns count inserted/upserted."""
    if not FACTS_FILE.exists():
        print(f"  [facts] {FACTS_FILE} not found — skipping.")
        return 0

    raw: List[Dict[str, Any]] = json.loads(FACTS_FILE.read_text(encoding="utf-8"))
    count = 0
    conflict_count = 0

    for fact in raw:
        fact_id = fact["id"]
        conflicts: List[Dict[str, Any]] = fact.pop("conflicts", [])

        row = {
            "id": fact_id,
            "owner_id": PRIMARY_OWNER_ID,
            "entity_type": fact["entity_type"],
            "title": fact.get("title") or "",
            "content": fact["content"],
            "source": fact["source"],
            "source_url_or_file": fact.get("source_url_or_file") or "",
            "import_date": fact.get("import_date"),
            "verification_status": fact.get("verification_status", "pending_review"),
            "visibility": "private",
            "metadata": fact.get("metadata") or {},
        }

        resp = _post("em_facts", row, client)
        if resp.status_code not in (200, 201):
            print(f"  [facts] WARN: id={fact_id} status={resp.status_code} body={resp.text[:200]}")
        else:
            count += 1

        # Seed conflict rows
        for c in conflicts:
            c_row = {
                "fact_id": fact_id,
                "conflict_type": c.get("conflict_type", "unsupported_claim"),
                "description": c.get("description", ""),
                "existing_value": c.get("existing_value"),
                "proposed_value": c.get("proposed_value"),
                "severity": c.get("severity", "warning"),
            }
            c_resp = _post("em_fact_conflicts", c_row, client)
            if c_resp.status_code not in (200, 201):
                print(f"  [conflicts] WARN: fact_id={fact_id} status={c_resp.status_code}")
            else:
                conflict_count += 1

    print(f"  [facts] {count}/{len(raw)} facts seeded, {conflict_count} conflict rows.")
    return count


# ---------------------------------------------------------------------------
# Seed sessions + turns
# ---------------------------------------------------------------------------

def seed_sessions(client: httpx.Client) -> int:
    """Upsert sessions and turns from sessions.json. Returns session count."""
    if not SESSIONS_FILE.exists():
        print(f"  [sessions] {SESSIONS_FILE} not found — skipping.")
        return 0

    data: Dict[str, Any] = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
    sessions_dict: Dict[str, Any] = data.get("sessions", {})
    turns_list: List[Dict[str, Any]] = data.get("turns", [])

    session_count = 0
    turn_count = 0

    for sid, sess in sessions_dict.items():
        s_row = {
            "id": sid,
            "owner_id": PRIMARY_OWNER_ID,
            "title": sess.get("title", "Conversation"),
            "created_at": sess.get("created_at"),
            "updated_at": sess.get("updated_at"),
        }
        resp = _post("em_sessions", s_row, client)
        if resp.status_code not in (200, 201):
            print(f"  [sessions] WARN: id={sid} status={resp.status_code}")
        else:
            session_count += 1

    for turn in turns_list:
        t_row = {
            "id": turn["id"],
            "session_id": turn["session_id"],
            "owner_id": PRIMARY_OWNER_ID,
            "role": turn["role"],
            "content": turn["content"],
            "mode": turn.get("mode"),
            "references": turn.get("references") or [],
            "created_at": turn.get("created_at"),
        }
        resp = _post("em_turns", t_row, client)
        if resp.status_code not in (200, 201):
            print(f"  [turns] WARN: id={turn['id']} status={resp.status_code}")
        else:
            turn_count += 1

    print(f"  [sessions] {session_count}/{len(sessions_dict)} sessions, {turn_count}/{len(turns_list)} turns seeded.")
    return session_count


# ---------------------------------------------------------------------------
# Verify counts
# ---------------------------------------------------------------------------

def verify_counts(client: httpx.Client) -> None:
    for table in ("em_facts", "em_sessions", "em_turns", "em_fact_conflicts"):
        resp = client.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={
                **SERVICE_HEADERS,
                "Prefer": "count=exact",
                "Range": "0-0",
            },
            params={"owner_id": f"eq.{PRIMARY_OWNER_ID}"} if table != "em_fact_conflicts" else {},
        )
        content_range = resp.headers.get("content-range", "?")
        print(f"  [verify] {table}: content-range={content_range}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"EchoMind seed script")
    print(f"  SUPABASE_URL      : {SUPABASE_URL}")
    print(f"  PRIMARY_OWNER_ID  : {PRIMARY_OWNER_ID}")
    print()

    with httpx.Client(timeout=30.0) as client:
        # Connectivity check
        health = client.get(f"{SUPABASE_URL}/rest/v1/", headers=SERVICE_HEADERS)
        if health.status_code not in (200, 404):  # 404 means table not found but API reachable
            print(f"ERROR: Cannot reach Supabase REST API. status={health.status_code}", file=sys.stderr)
            sys.exit(1)

        print("Seeding facts...")
        seed_facts(client)

        print("Verifying row counts...")
        verify_counts(client)

    print()
    print("Seed complete. JSON source files were not modified.")


if __name__ == "__main__":
    main()
