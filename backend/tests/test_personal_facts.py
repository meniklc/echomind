"""Regression tests for personal fact retrieval (Phase 1).

Covers the corrected behaviours:
- name / identity questions answer instead of claiming "no verified information"
- combined multi-part questions retrieve every relevant section
- project-list phrasings (e.g. "Tell me about your projects") return projects
- unknown / out-of-scope questions stay honest and never fabricate
"""

from __future__ import annotations

import pytest

from app.services.knowledge import get_projects, is_publicly_listable
from app.services.llm import FactRetrievalProvider
from app.services.retrieval import retrieve_context


def _sections(question: str) -> dict:
    return retrieve_context(question).get("sections", {})


async def _answer(question: str, history=None) -> str:
    context = retrieve_context(question, history=history)
    return await FactRetrievalProvider().generate(question, context, history)


# ---------------------------------------------------------------------------
# Identity / name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_name_question_returns_name() -> None:
    answer = await _answer("What is your name?")
    assert "Medha Nipuna" in answer
    assert "don't have verified information" not in answer


def test_name_question_is_substantive() -> None:
    context = retrieve_context("What is your name?")
    assert context["has_substantive_facts"] is True
    assert "summary" in context["sections"]


@pytest.mark.asyncio
async def test_name_question_in_follow_up_turn_still_states_name() -> None:
    history = [
        {"role": "user", "content": "What technologies do you use?"},
        {"role": "assistant", "content": "Python, FastAPI, React."},
    ]
    answer = await _answer("What is your full name?", history=history)
    assert "Medha Nipuna" in answer


# ---------------------------------------------------------------------------
# Combined multi-part questions
# ---------------------------------------------------------------------------


def test_combined_identity_and_education_question() -> None:
    context = retrieve_context("What is your name and where do you study?")
    sections = context["sections"]
    assert "summary" in sections
    assert "education" in sections
    assert context["has_substantive_facts"] is True


def test_combined_skills_and_projects_question() -> None:
    sections = _sections("What are your skills and what projects have you built?")
    assert "skills" in sections
    assert "projects" in sections


# ---------------------------------------------------------------------------
# Project list phrasings
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        "Tell me about your projects.",
        "Tell me about your projects",
        "What projects have you built?",
        "Show me all your projects.",
        "List your projects.",
    ],
)
def test_project_list_phrasings_return_projects(question: str) -> None:
    sections = _sections(question)
    assert "projects" in sections, question
    assert len(sections["projects"]) >= 2


# Projects present in projects.json only as unconfirmed candidates (uncertain
# status, no verified functional details). They must never appear in a broad
# "what projects have you built?" answer, but must stay retrievable directly.
UNCONFIRMED_CANDIDATE_IDS = {"covid19-prediction", "bbms"}


@pytest.mark.parametrize(
    "question",
    [
        "Tell me about your projects.",
        "What projects have you built?",
        "Show me all your projects.",
        "List your projects.",
        "What have you built?",
    ],
)
def test_project_list_excludes_unconfirmed_candidates(question: str) -> None:
    ids = {p["id"] for p in _sections(question).get("projects", [])}
    assert ids, question
    assert ids.isdisjoint(UNCONFIRMED_CANDIDATE_IDS), (question, ids)
    # Confirmed projects must still be listed.
    assert {"ai-learn", "securalm", "phishcure"} & ids


def test_every_listed_project_is_publicly_listable() -> None:
    all_projects = get_projects()
    listed_ids = {p["id"] for p in all_projects if is_publicly_listable(p)}
    assert listed_ids.isdisjoint(UNCONFIRMED_CANDIDATE_IDS)
    # The candidates are excluded from listing, not deleted from the facts.
    assert UNCONFIRMED_CANDIDATE_IDS <= {p["id"] for p in all_projects}


@pytest.mark.parametrize(
    "question, expected_id",
    [
        ("What is the COVID-19 prediction project repository?", "covid19-prediction"),
        ("Tell me about BBMS or HemoCloud.", "bbms"),
    ],
)
def test_direct_questions_still_reach_unconfirmed_candidates(
    question: str, expected_id: str
) -> None:
    ids = [p["id"] for p in _sections(question).get("projects", [])]
    assert ids == [expected_id], (question, ids)


def test_about_your_projects_is_not_treated_as_introduction() -> None:
    sections = _sections("Tell me about your projects.")
    assert "projects" in sections
    assert "summary" not in sections


def test_explicit_project_query_stays_selective() -> None:
    sections = _sections("Explain the architecture of SecuraLM.")
    assert [p["id"] for p in sections["projects"]] == ["securalm"]


# ---------------------------------------------------------------------------
# Unknown / out-of-scope / restricted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_personal_topic_is_honest_and_data_driven() -> None:
    answer = await _answer("Do you have a Nobel Prize in quantum computing?")
    lowered = answer.lower()
    assert "don't have verified information" in lowered
    # Guidance must come from the knowledge base, not hard-coded names.
    assert "uvce" in lowered
    assert "projects (" in lowered


def test_out_of_scope_domain_has_no_substantive_facts() -> None:
    context = retrieve_context("Tell me about your experience as a cardiac surgeon.")
    assert context["has_substantive_facts"] is False
    assert not context["references"]


@pytest.mark.asyncio
async def test_restricted_topic_does_not_fabricate() -> None:
    answer = await _answer("What is your salary expectation and home address?")
    lowered = answer.lower()
    assert "don't have verified information" in lowered
    assert "salary" not in lowered.replace("don't have verified information", "")


# ---------------------------------------------------------------------------
# Attribution
# ---------------------------------------------------------------------------


def test_identity_reference_is_attributed() -> None:
    context = retrieve_context("What is your name?")
    labels = [ref.label.lower() for ref in context["references"]]
    assert any("summary" in label for label in labels)
