"""Lightweight keyword relevance matching over structured profile data."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from app.schemas.chat import PortfolioReference
from app.services.knowledge import get_profile, get_projects


STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "about",
    "your",
    "you",
    "me",
    "my",
    "is",
    "are",
    "was",
    "were",
    "what",
    "which",
    "who",
    "how",
    "why",
    "do",
    "does",
    "did",
    "can",
    "could",
    "would",
    "should",
    "tell",
    "explain",
    "please",
    "this",
    "that",
    "have",
    "has",
    "had",
}


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9+#.]{2,}", text.lower())
    return {w for w in words if w not in STOPWORDS}


def _score_text(query_tokens: set[str], *parts: str) -> int:
    haystack = _tokens(" ".join(p for p in parts if p))
    return len(query_tokens & haystack)


def retrieve_context(question: str, top_k: int = 4) -> Dict[str, Any]:
    profile = get_profile()
    projects = get_projects()
    q = question.lower()
    query_tokens = _tokens(question)

    sections: Dict[str, Any] = {}
    references: List[PortfolioReference] = []

    # Intent-ish boosts for common recruiter questions
    if any(k in q for k in ("yourself", "about you", "who are", "introduction", "intro")):
        sections["summary"] = {
            "name": profile.get("name"),
            "headline": profile.get("headline"),
            "summary": profile.get("summary"),
            "interests": profile.get("interests"),
            "disclaimer": profile.get("disclaimer"),
        }
        references.append(
            PortfolioReference(type="profile", label="Professional summary", section="summary")
        )

    if any(k in q for k in ("skill", "technolog", "stack", "tool", "language", "framework")):
        sections["skills"] = profile.get("skills")
        references.append(
            PortfolioReference(type="profile", label="Technical skills", section="skills")
        )

    if any(k in q for k in ("experience", "internship", "work", "job", "role", "employ")):
        sections["experience"] = profile.get("experience")
        references.append(
            PortfolioReference(type="profile", label="Experience", section="experience")
        )

    if any(k in q for k in ("educat", "college", "university", "degree", "graduat", "school")):
        sections["education"] = profile.get("education")
        references.append(
            PortfolioReference(type="profile", label="Education", section="education")
        )

    if any(k in q for k in ("career", "goal", "suitable", "fit", "why hire", "aspir")):
        sections["career_goals"] = profile.get("career_goals")
        sections["skills"] = sections.get("skills") or profile.get("skills")
        sections["interests"] = profile.get("interests")
        references.append(
            PortfolioReference(type="profile", label="Career goals", section="career_goals")
        )

    if any(k in q for k in ("certif", "achiev", "award", "hackathon")):
        sections["achievements"] = profile.get("achievements")
        references.append(
            PortfolioReference(type="profile", label="Achievements", section="achievements")
        )

    if any(k in q for k in ("contact", "email", "resume", "cv", "linkedin", "github", "reach")):
        sections["links"] = profile.get("links")
        links = profile.get("links") or {}
        for key, label in (
            ("github", "GitHub"),
            ("resume", "Resume"),
            ("linkedin", "LinkedIn"),
            ("email", "Email"),
        ):
            url = links.get(key)
            if url and not str(url).startswith("PLACEHOLDER"):
                references.append(
                    PortfolioReference(type="link", label=label, section="links", url=str(url))
                )

    scored: List[Tuple[int, Dict[str, Any]]] = []
    for project in projects:
        score = _score_text(
            query_tokens,
            project.get("name", ""),
            project.get("short_summary", ""),
            project.get("problem_solved", ""),
            " ".join(project.get("technologies") or []),
            " ".join(project.get("tags") or []),
            project.get("contribution", ""),
            project.get("id", ""),
        )
        # Boost if project name appears in question
        name = (project.get("name") or "").lower()
        pid = (project.get("id") or "").lower()
        if name and name in q:
            score += 5
        if pid and pid.replace("-", " ") in q:
            score += 4
        if any(k in q for k in ("project", "built", "portfolio", "demo")):
            score += 1
        if score > 0:
            scored.append((score, project))

    scored.sort(key=lambda item: item[0], reverse=True)
    selected_projects = [p for _, p in scored[:top_k]]

    # If user asked about projects but nothing scored, include known project cards lightly
    if any(k in q for k in ("project", "built", "portfolio")) and not selected_projects:
        selected_projects = projects[:top_k]

    if selected_projects:
        sections["projects"] = [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "short_summary": p.get("short_summary"),
                "problem_solved": p.get("problem_solved"),
                "technologies": p.get("technologies"),
                "contribution": p.get("contribution"),
                "status": p.get("status"),
                "outcomes": p.get("outcomes"),
                "repository_url": p.get("repository_url"),
                "demo_url": p.get("demo_url"),
            }
            for p in selected_projects
        ]
        for project in selected_projects:
            references.append(
                PortfolioReference(
                    type="project",
                    label=project.get("name") or "Project",
                    section="projects",
                    url=project.get("repository_url"),
                    project_id=project.get("id"),
                )
            )

    # Always include identity + disclaimer for grounding
    sections.setdefault(
        "identity",
        {
            "name": profile.get("name"),
            "disclaimer": profile.get("disclaimer"),
        },
    )

    return {
        "sections": sections,
        "references": _dedupe_references(references),
        "has_substantive_facts": _has_substantive_facts(sections),
    }


def _dedupe_references(refs: List[PortfolioReference]) -> List[PortfolioReference]:
    seen: set[tuple] = set()
    unique: List[PortfolioReference] = []
    for ref in refs:
        key = (ref.type, ref.label, ref.section, ref.url, ref.project_id)
        if key in seen:
            continue
        seen.add(key)
        unique.append(ref)
    return unique


def _has_substantive_facts(sections: Dict[str, Any]) -> bool:
    """True when retrieved content has non-placeholder substance beyond identity."""
    blob = str(sections)
    if "PLACEHOLDER" in blob and blob.count("PLACEHOLDER") >= 3 and "projects" not in sections:
        # Mostly placeholders and no projects — still allow answering with honesty
        return True
    return bool(sections.get("summary") or sections.get("skills") or sections.get("projects")
                or sections.get("experience") or sections.get("education")
                or sections.get("career_goals") or sections.get("links")
                or sections.get("achievements"))


def format_facts_for_prompt(sections: Dict[str, Any]) -> str:
    """Compact textual fact block for LLM / fact-retrieval answers."""
    lines: List[str] = []
    for key, value in sections.items():
        lines.append(f"## {key}")
        lines.append(_format_value(value))
        lines.append("")
    return "\n".join(lines).strip()


def _format_value(value: Any, indent: int = 0) -> str:
    pad = "  " * indent
    if isinstance(value, dict):
        return "\n".join(f"{pad}- {k}: {_format_value(v, indent + 1)}" for k, v in value.items())
    if isinstance(value, list):
        if not value:
            return f"{pad}(none listed)"
        if all(not isinstance(i, (dict, list)) for i in value):
            return f"{pad}{', '.join(str(i) for i in value)}"
        return "\n".join(f"{pad}- {_format_value(i, indent + 1)}" for i in value)
    return f"{pad}{value}"
