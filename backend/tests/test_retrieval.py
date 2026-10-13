"""Automated unit and integration tests for the personal RAG retrieval engine."""

from __future__ import annotations

import pytest
from app.services.retrieval import retrieve_context


def test_ai_learn_retrieval() -> None:
    context = retrieve_context("Explain my AI Learn internship and the work I did on the project.")
    sections = context.get("sections", {})
    projects = sections.get("projects", [])
    references = context.get("references", [])

    assert len(projects) == 1
    assert projects[0]["id"] == "ai-learn"
    assert "FastAPI" in projects[0]["technologies"]
    assert "Tesseract OCR" in projects[0]["technologies"]
    # Check that references include AI Learn
    ref_labels = [r.label.lower() for r in references]
    assert any("ai learn" in label for label in ref_labels)
    # Ensure unrelated projects are not attached
    ref_ids = [r.project_id for r in references if r.project_id]
    assert "phishcure" not in ref_ids
    assert "securalm" not in ref_ids


def test_phishcure_retrieval() -> None:
    context = retrieve_context("Tell me about PhishCure and the problem it solved.")
    sections = context.get("sections", {})
    projects = sections.get("projects", [])
    references = context.get("references", [])

    assert len(projects) == 1
    assert projects[0]["id"] == "phishcure"
    # Unrelated projects must not be returned
    assert all(p["id"] == "phishcure" for p in projects)
    ref_labels = [r.label.lower() for r in references]
    assert any("phishcure" in label for label in ref_labels)
    assert not any("securalm" in label for label in ref_labels)


def test_skills_query_does_not_flood_unrelated_projects() -> None:
    context = retrieve_context("What technologies do you work with?")
    sections = context.get("sections", {})
    references = context.get("references", [])

    assert "skills" in sections
    skills = sections["skills"]
    assert "languages" in skills
    assert "Python" in skills["languages"]
    # Should not attach individual project cards for a general skills question
    project_refs = [r for r in references if r.type == "project"]
    assert len(project_refs) == 0


def test_broad_project_query_returns_overview() -> None:
    context = retrieve_context("What projects have I built?")
    sections = context.get("sections", {})
    projects = sections.get("projects", [])

    assert len(projects) >= 3
    ids = {p["id"] for p in projects}
    assert "ai-learn" in ids or "securalm" in ids or "phishcure" in ids


def test_explicit_project_ranks_above_keyword_noise() -> None:
    # "SecuraLM" uses Python and machine learning, as do other projects.
    # It must selectively retrieve SecuraLM, not COVID-19 or PhishCure.
    context = retrieve_context("Explain the architecture of SecuraLM.")
    sections = context.get("sections", {})
    projects = sections.get("projects", [])

    assert len(projects) == 1
    assert projects[0]["id"] == "securalm"
    assert "TinyLlama" in projects[0]["technologies"]
    assert "ChromaDB" in projects[0]["technologies"]


def test_follow_up_project_resolution() -> None:
    history = [
        {
            "role": "user",
            "content": "Explain my AI Learn internship and the work I did on the project.",
        },
        {
            "role": "assistant",
            "content": "At Apti Business Solutions, you worked on AI Learn, implementing OCR and the RAG tutor.",
        },
    ]
    # Follow-up without explicitly saying "AI Learn"
    context = retrieve_context("What technologies did I use for the AI tutor?", history=history)
    sections = context.get("sections", {})
    projects = sections.get("projects", [])

    assert len(projects) == 1
    assert projects[0]["id"] == "ai-learn"


def test_unknown_topic_does_not_fabricate() -> None:
    context = retrieve_context("Did you win an Olympic gold medal in swimming?")
    assert context.get("has_substantive_facts") is False
    sections = context.get("sections", {})
    assert "projects" not in sections
    assert "education" not in sections
    assert "experience" not in sections
