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
    return list(get_projects_data().get("projects", []))


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
