"""Intent-aware, selective hybrid RAG retrieval pipeline for personal digital twin."""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.schemas.chat import PortfolioReference
from app.services.knowledge import get_profile, get_projects, get_verified_chunks
from app.services.semantic import compute_semantic_similarity

STOPWORDS = {
    "a", "an", "the", "and", "or", "to", "of", "in", "for", "on", "with", "about",
    "your", "you", "me", "my", "i", "is", "are", "was", "were", "what", "which", "who",
    "how", "why", "do", "does", "did", "can", "could", "would", "should", "tell", "explain",
    "please", "this", "that", "have", "has", "had", "built", "work", "worked", "using", "used",
}

PROJECT_ALIASES: Dict[str, List[str]] = {
    "ai-learn": [
        "ai learn", "ailms", "ai tutor", "ai-tutor", "learning management system",
        "apti internship", "apti project", "ocr tutor", "student telemetry",
    ],
    "phishcure": [
        "phishcure", "phish cure", "phishing url", "phishing classification",
        "phishing detection", "url phishing", "skilldisk project", "skilldisk internship",
    ],
    "securalm": [
        "securalm", "secura lm", "soc copilot", "threat intelligence", "soc analyst",
        "mitre attack", "cve", "tinyllama",
    ],
    "nexusops-ai": [
        "nexusops", "nexusops ai", "nexus ops", "enterprise ai assistant",
        "permission aware", "rbac",
    ],
    "covid19-prediction": [
        "covid", "covid-19", "covid 19", "covid prediction",
    ],
    "bbms": [
        "bbms", "hemocloud", "blood bank", "blood bank management",
    ],
    "cognix": [
        "cognix", "career guidance hackathon", "kle college hackathon", "career preferences",
    ],
}

EXPERIENCE_ALIASES: Dict[str, List[str]] = {
    "apti": ["apti", "apti business solutions", "ai learn internship", "ailms"],
    "skilldisk": ["skilldisk", "phishing internship"],
    "hid": ["hid", "hid global", "sde apprentice", "apprenticeship"],
}


def _tokenize(text: str) -> List[str]:
    """Tokenize query while preserving technical keywords."""
    clean = text.lower().replace("-", " ")
    tokens = re.findall(r"[a-z0-9+#.]{2,}", clean)
    return [t for t in tokens if t not in STOPWORDS]


def _bm25_score(
    query_tokens: List[str],
    doc_tokens: List[str],
    k1: float = 1.2,
    b: float = 0.75,
    avg_doc_len: float = 40.0,
) -> float:
    """Compute BM25 score for query tokens against document tokens."""
    if not query_tokens or not doc_tokens:
        return 0.0

    doc_len = len(doc_tokens)
    tf: Dict[str, int] = {}
    for t in doc_tokens:
        tf[t] = tf.get(t, 0) + 1

    score = 0.0
    for q in set(query_tokens):
        freq = tf.get(q, 0)
        if freq > 0:
            numerator = freq * (k1 + 1.0)
            denominator = freq + k1 * (1.0 - b + b * (doc_len / avg_doc_len))
            score += numerator / denominator
    return score


def _detect_explicit_project(text: str) -> Optional[str]:
    """Identify if the text mentions a specific project by id, name, or alias."""
    q = text.lower()
    for pid, aliases in PROJECT_ALIASES.items():
        if pid in q or pid.replace("-", " ") in q:
            return pid
        for alias in aliases:
            if alias in q:
                return pid
    return None


def _resolve_subject_from_history(
    question: str, history: Optional[List[Dict[str, str]]]
) -> Optional[str]:
    """Resolve an ambiguous project subject using recent conversation turns."""
    # 1. Check if the current question mentions it directly
    direct = _detect_explicit_project(question)
    if direct:
        return direct

    # 2. Check if the question looks like a follow-up
    q = question.lower()
    is_followup = any(
        kw in q
        for kw in (
            "it", "this", "that", "the project", "the tutor", "the tool",
            "technologies did i use", "tech stack used", "my contribution",
            "architecture", "how did i build", "what did i do",
        )
    )
    if not is_followup:
        return None

    # Inspect previous messages (most recent first)
    for turn in reversed(history or []):
        content = turn.get("content", "")
        pid = _detect_explicit_project(content)
        if pid:
            return pid

    return None


def retrieve_context(
    question: str,
    top_k: int = 2,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    profile = get_profile()
    projects = get_projects()
    q = question.lower().strip()
    query_tokens = _tokenize(question)

    sections: Dict[str, Any] = {}
    references: List[PortfolioReference] = []

    # 1. Resolve explicit project target or follow-up target
    target_project_id = _resolve_subject_from_history(question, history)

    has_unrelated_domain = any(
        k in q for k in (
            # Medicine / Biology
            "surgeon", "surgery", "doctor", "cardiac", "nurse", "therapist", "physician",
            "pharmacist", "dentist", "veterinarian", "hospital", "clinical",
            # Science outside profile scope
            "quantum", "nobel", "physic", "biolog", "chemist", "geolog",
            # Transport / Automotive
            "pilot", "aviator", "racing driver", "self-driving car", "autonomous vehicle",
            "car engine", "automobile", "truck driver",
            # Legal / Finance
            "lawyer", "attorney", "judge", "patent", "lawsuit", "stock broker",
            "hedge fund", "trading algorithm", "forex", "cryptocurrency miner",
            # Entertainment
            "musician", "singer", "actor", "actress", "director", "screenplay",
            "chef", "cook", "restaurant",
            # Sports
            "footballer", "cricket", "tennis player", "olympian", "marathon",
        )
    )
    is_intro_query = not has_unrelated_domain and any(k in q for k in ("yourself", "about you", "who are", "introduction", "intro", "summary"))
    is_skills_query = not has_unrelated_domain and any(k in q for k in ("skill", "technolog", "tech stack", "languages", "frameworks", "tools", "libraries"))
    is_education_query = not has_unrelated_domain and any(k in q for k in ("educat", "college", "university", "degree", "graduat", "school", "b.tech", "diploma", "cgpa", "gpa", "uvce"))
    is_experience_query = not has_unrelated_domain and any(k in q for k in ("experience", "internship", "intern", "employment", "apti", "skilldisk", "hid"))
    is_projects_list_query = not has_unrelated_domain and any(k in q for k in ("what projects", "projects have", "portfolio projects", "built any", "all projects", "show me your projects", "list projects"))
    is_career_goals_query = not has_unrelated_domain and any(k in q for k in ("career", "goal", "aspir", "future plan", "suitable", "fit for", "why hire", "hire you"))
    is_achievements_query = not has_unrelated_domain and any(k in q for k in ("certif", "achiev", "award", "hackathon"))
    is_links_query = any(k in q for k in ("contact", "email", "resume", "cv", "linkedin", "github", "reach", "connect"))

    # Intent A: Professional Introduction / Summary
    if is_intro_query:
        if not target_project_id:
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

    # Intent B: Technical Skills
    if is_skills_query and not target_project_id:
        sections["skills"] = profile.get("skills")
        references.append(
            PortfolioReference(type="profile", label="Technical skills", section="skills")
        )

    # Intent C: Education
    if is_education_query:
        sections["education"] = profile.get("education")
        references.append(
            PortfolioReference(type="profile", label="Education (UVCE Bengaluru)", section="education")
        )

    # Intent D: Experience / Internships
    if is_experience_query and not target_project_id:
        sections["experience"] = profile.get("experience")
        references.append(
            PortfolioReference(type="profile", label="Work Experience", section="experience")
        )

    # Intent E: Career Goals & Suitability
    if is_career_goals_query and not target_project_id:
        sections["career_goals"] = profile.get("career_goals")
        sections["skills"] = sections.get("skills") or profile.get("skills")
        sections["interests"] = profile.get("interests")
        references.append(
            PortfolioReference(type="profile", label="Career goals", section="career_goals")
        )

    # Intent F: Achievements & Certifications
    if is_achievements_query and not target_project_id:
        sections["achievements"] = profile.get("achievements")
        references.append(
            PortfolioReference(type="profile", label="Achievements", section="achievements")
        )

    # Intent G: Links & Contact
    if is_links_query:
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

    # Project Retrieval: Selective & Intent-driven
    selected_projects: List[Dict[str, Any]] = []

    if target_project_id:
        # SELECTIVE RETRIEVAL: User asked about a specific project or follow-up
        for p in projects:
            if p.get("id") == target_project_id:
                selected_projects.append(p)
                break

        # Attach connected internship experience only when question asks about experience/internship
        if target_project_id == "ai-learn" and any(k in q for k in ("internship", "apti", "company", "role", "work")):
            exp_list = profile.get("experience") or []
            apti_exp = [e for e in exp_list if "apti" in str(e.get("organization", "")).lower()]
            if apti_exp:
                sections["experience"] = apti_exp
                references.append(
                    PortfolioReference(type="profile", label="Apti Business Solutions Internship", section="experience")
                )
        elif target_project_id == "phishcure" and any(k in q for k in ("internship", "skilldisk", "company", "role")):
            exp_list = profile.get("experience") or []
            skilldisk_exp = [e for e in exp_list if "skilldisk" in str(e.get("organization", "")).lower()]
            if skilldisk_exp:
                sections["experience"] = skilldisk_exp
                references.append(
                    PortfolioReference(type="profile", label="SkillDisk Internship", section="experience")
                )

    elif is_projects_list_query:
        # Broad overview of portfolio: retrieve all verified projects
        selected_projects = list(projects)

    elif not is_skills_query and not is_education_query and not is_links_query:
        # HYBRID RANKING: Compute BM25 + Semantic Similarity for candidate projects
        scored_candidates: List[Tuple[float, Dict[str, Any]]] = []
        for p in projects:
            doc_text = " ".join([
                p.get("name", ""),
                p.get("short_summary", ""),
                p.get("problem_solved", ""),
                " ".join(p.get("technologies") or []),
                " ".join(p.get("tags") or []),
                p.get("contribution", ""),
            ])
            doc_tokens = _tokenize(doc_text)

            bm25 = _bm25_score(query_tokens, doc_tokens)
            sem_sim = compute_semantic_similarity(question, doc_text)

            # Combined hybrid score (normalize BM25 with sigmoid-like dampening)
            norm_bm25 = bm25 / (bm25 + 2.0) if bm25 > 0 else 0.0
            hybrid_score = 0.5 * norm_bm25 + 0.5 * sem_sim

            # Check if project name appears directly
            p_name = (p.get("name") or "").lower()
            p_id = (p.get("id") or "").lower()
            if (p_name and p_name in q) or (p_id and p_id in q):
                hybrid_score += 0.8

            # Relevance threshold: filter weak spurious matches
            if hybrid_score >= 0.40:
                scored_candidates.append((hybrid_score, p))

        scored_candidates.sort(key=lambda item: item[0], reverse=True)
        selected_projects = [p for _, p in scored_candidates[:top_k]]

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
                "notes": p.get("notes"),
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

    # Search verified document chunks (e.g. from ingested resume, LinkedIn export, or readmes)
    verified_chunks = get_verified_chunks()
    if verified_chunks and not has_unrelated_domain:
        matched_chunks = []
        for chunk in verified_chunks:
            chunk_text = f"{chunk.get('title', '')} {chunk.get('content', '')}"
            c_tokens = _tokenize(chunk_text)
            c_bm25 = _bm25_score(query_tokens, c_tokens)
            c_sem = compute_semantic_similarity(question, chunk_text)
            c_norm_bm25 = c_bm25 / (c_bm25 + 2.0) if c_bm25 > 0 else 0.0
            score = 0.5 * c_norm_bm25 + 0.5 * c_sem
            if score >= 0.45:
                matched_chunks.append((score, chunk))
        if matched_chunks:
            matched_chunks.sort(key=lambda x: x[0], reverse=True)
            sections["verified_documents"] = [
                {
                    "title": c[1].get("title"),
                    "source": c[1].get("source"),
                    "content": c[1].get("content")[:800],
                }
                for c in matched_chunks[:2]
            ]
            for _, c in matched_chunks[:2]:
                references.append(
                    PortfolioReference(
                        type="document",
                        label=c.get("title") or "Verified Document",
                        section="documents",
                        url=c.get("source_url_or_file"),
                    )
                )

    # Always include candidate identity & disclaimer
    sections.setdefault(
        "identity",
        {
            "name": profile.get("name"),
            "headline": profile.get("headline"),
            "disclaimer": profile.get("disclaimer"),
        },
    )

    return {
        "sections": sections,
        "references": _dedupe_references(references),
        "has_substantive_facts": _has_substantive_facts(sections),
    }


def _dedupe_references(refs: List[PortfolioReference]) -> List[PortfolioReference]:
    seen: Set[Tuple[Any, ...]] = set()
    unique: List[PortfolioReference] = []
    for ref in refs:
        key = (ref.type, ref.label, ref.section, ref.url, ref.project_id)
        if key in seen:
            continue
        seen.add(key)
        unique.append(ref)
    return unique


def _has_substantive_facts(sections: Dict[str, Any]) -> bool:
    """True when retrieved content contains verified domain facts beyond identity."""
    substantive_keys = {
        "summary", "skills", "projects", "experience", "education",
        "career_goals", "links", "achievements",
    }
    return any(k in sections for k in substantive_keys)


def format_facts_for_prompt(sections: Dict[str, Any]) -> str:
    """Compact textual fact block for LLM / fact-retrieval prompts."""
    lines: List[str] = []
    for key, value in sections.items():
        lines.append(f"## {key.upper()}")
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
