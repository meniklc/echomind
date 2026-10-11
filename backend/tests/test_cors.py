from fastapi.testclient import TestClient


def test_cors_allows_configured_origin(client: TestClient) -> None:
    response = client.options(
        "/api/profile",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_blocks_unknown_origin(client: TestClient) -> None:
    response = client.get(
        "/api/profile",
        headers={"Origin": "https://evil.example"},
    )
    # FastAPI still returns 200 for the resource, but should not echo evil origin
    assert response.headers.get("access-control-allow-origin") != "https://evil.example"
