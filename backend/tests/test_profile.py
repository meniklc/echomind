from fastapi.testclient import TestClient


def test_profile_returns_public_fields(client: TestClient) -> None:
    response = client.get("/api/profile")
    assert response.status_code == 200
    data = response.json()
    assert "Medha Nipuna" in data["name"]
    assert "skills" in data
    assert "projects" in data
    assert isinstance(data["projects"], list)
    assert "suggested_questions" in data
    assert "disclaimer" in data
    # Must not invent private secrets
    assert "llm_api_key" not in data
    assert "api_key" not in data
