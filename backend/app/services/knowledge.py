"""Load and expose the editable JSON knowledge base."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"


def _load_json(filename: str) -> Dict[str, Any]:
    path = KNOWLEDGE_DIR / filename
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache
def get_profile() -> Dict[str, Any]:
    return _load_json("profile.json")


@lru_cache
def get_projects_data() -> Dict[str, Any]:
    return _load_json("projects.json")


def get_projects() -> List[Dict[str, Any]]:
    base_projects = list(get_projects_data().get("projects", []))
    # Augment with any verified ingested projects
    verified_chunks = get_verified_chunks()
    existing_names = {p.get("name", "").lower() for p in base_projects}
    existing_urls = {p.get("repository_url") for p in base_projects if p.get("repository_url")}

    for chunk in verified_chunks:
        if chunk.get("entity_type") == "project":
            meta = chunk.get("metadata", {})
            name = meta.get("name") or chunk.get("title", "")
            url = meta.get("html_url") or chunk.get("source_url_or_file")
            if name.lower() not in existing_names and url not in existing_urls:
                base_projects.append({
                    "id": chunk.get("id"),
                    "name": name,
                    "short_summary": meta.get("description") or chunk.get("content", "")[:200],
                    "problem_solved": "Imported and verified via GitHub synchronization.",
                    "technologies": [meta.get("language")] if meta.get("language") else [],
                    "contribution": f"Created repository and documentation ({url}).",
                    "status": "verified (github sync)",
                    "outcomes": [],
                    "repository_url": url,
                    "demo_url": None,
                    "tags": meta.get("topics", ["project"]),
                    "notes": f"Imported on {chunk.get('import_date')}",
                })
                existing_names.add(name.lower())
    return base_projects


def is_publicly_listable(project: Dict[str, Any]) -> bool:
    """True unless a project is explicitly opted out of broad public listings.

    ``public_listing`` is presentation metadata, not a fact: entries marked
    ``false`` (e.g. candidates still awaiting confirmation) remain fully
    retrievable when asked about directly, but are excluded from overview
    answers such as "what projects have you built?".
    """
    value = project.get("public_listing", True)
    if isinstance(value, str):
        return value.strip().lower() not in {"false", "0", "no", "off"}
    return bool(value)


@lru_cache
def get_verified_chunks() -> List[Dict[str, Any]]:
    """Return approved, verified knowledge chunks from the ingestion ledger."""
    facts_file = KNOWLEDGE_DIR / "ingested_facts.json"
    if not facts_file.exists():
        return []
    try:
        with facts_file.open(encoding="utf-8") as handle:
            facts = json.load(handle)
            return [
                f for f in facts
                if f.get("verification_status") == "verified"
                and f.get("visibility") == "public"
            ]
    except Exception as exc:
        logger.warning("Could not load verified chunks: %s", exc)
        return []


def get_public_profile() -> Dict[str, Any]:
    """Return portfolio fields safe for the public API."""
    profile = get_profile()
    projects = get_projects()
    return {
        "name": profile.get("name"),
        "headline": profile.get("headline"),
        "summary": profile.get("summary"),
        "interests": profile.get("interests", []),
        "education": profile.get("education", []),
        "skills": profile.get("skills", {}),
        "experience": profile.get("experience", []),
        "achievements": profile.get("achievements", []),
        "career_goals": profile.get("career_goals"),
        "links": profile.get("links", {}),
        "suggested_questions": profile.get("suggested_questions", []),
        "disclaimer": profile.get("disclaimer"),
        "projects": projects,
    }


def clear_knowledge_cache() -> None:
    get_profile.cache_clear()
    get_projects_data.cache_clear()
    get_verified_chunks.cache_clear()
