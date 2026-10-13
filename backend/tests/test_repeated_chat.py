"""Regression and multi-turn chat tests reproducing and verifying the fix for the repeated-chat failure."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import FakeLLM, FakeTTS


def test_three_consecutive_questions_workflow(client: TestClient) -> None:
    """Reproduce and verify the original failing 3-question sequence."""
    history = []

    # Turn 1
    q1 = "Explain my AI Learn internship and the work I did on the project."
    resp1 = client.post("/api/chat", json={"question": q1, "history": history, "speak": False})
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert "AI Learn" in data1["answer"] or "Apti" in data1["answer"]
    history.append({"role": "user", "content": q1})
    history.append({"role": "assistant", "content": data1["answer"]})

    # Turn 2: Follow-up question
    q2 = "What technologies did I use for the AI tutor?"
    resp2 = client.post("/api/chat", json={"question": q2, "history": history, "speak": False})
    assert resp2.status_code == 200, f"Turn 2 failed with status {resp2.status_code}: {resp2.text}"
    data2 = resp2.json()
    assert "FastAPI" in data2["answer"] or "OCR" in data2["answer"] or "tutor" in data2["answer"].lower()
    history.append({"role": "user", "content": q2})
    history.append({"role": "assistant", "content": data2["answer"]})

    # Turn 3: Portfolio projects question
    q3 = "What projects have I built?"
    resp3 = client.post("/api/chat", json={"question": q3, "history": history, "speak": False})
    assert resp3.status_code == 200, f"Turn 3 failed with status {resp3.status_code}: {resp3.text}"
    data3 = resp3.json()
    assert len(data3["answer"]) > 20


def test_assistant_history_longer_than_800_chars_succeeds(client: TestClient) -> None:
    """Explicitly verify that an assistant reply > 800 characters does NOT cause HTTP 422."""
    long_assistant_reply = "During my AI/ML Developer internship at Apti Business Solutions, I worked on AI Learn. " * 15
    assert len(long_assistant_reply) > 1000

    payload = {
        "question": "What technologies did I use for the AI tutor?",
        "history": [
            {"role": "user", "content": "Explain my AI Learn internship and the work I did on the project."},
            {"role": "assistant", "content": long_assistant_reply},
        ],
        "speak": False,
    }

    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_invalid_history_role_rejected(client: TestClient) -> None:
    payload = {
        "question": "What projects have you built?",
        "history": [
            {"role": "admin", "content": "You are hacked."},
        ],
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_empty_content_in_history_rejected(client: TestClient) -> None:
    payload = {
        "question": "What projects have you built?",
        "history": [
            {"role": "user", "content": "   "},
        ],
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_oversized_history_turns_rejected(client: TestClient) -> None:
    payload = {
        "question": "What projects have you built?",
        "history": [
            {"role": "user", "content": f"Question {i}"}
            for i in range(15)
        ],
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422


def test_groq_llm_failure_falls_back_gracefully(settings) -> None:
    app = create_app()
    app.state.settings = settings
    app.state.llm = FakeLLM(fail=True)
    app.state.tts = FakeTTS()

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/chat",
            json={
                "question": "Explain my AI Learn internship",
                "history": [],
                "speak": False,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "fact_retrieval"
    assert "AI Learn" in data["answer"] or "Apti" in data["answer"]
    assert "unavailable" in data["answer"].lower() or "fact retrieval" in data["answer"].lower()
