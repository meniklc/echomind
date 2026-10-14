"""Owner-only API authorization and Supabase JWT verification tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core import auth

_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PUBLIC_KEY = _PRIVATE_KEY.public_key()
_ISSUER = "https://example.supabase.co/auth/v1"

ADMIN_REQUESTS = [
    ("GET", "/api/admin/auth/me", {}),
    ("POST", "/api/admin/ingest/github", {"json": {"username": "example"}}),
    ("POST", "/api/admin/ingest/file", {"files": {"file": ("doc.txt", b"test")}}),
    ("POST", "/api/admin/ingest/linkedin", {"files": {"file": ("doc.txt", b"test")}}),
    ("GET", "/api/admin/ingest/status", {}),
    ("GET", "/api/admin/ingest/pending", {}),
    (
        "POST",
        "/api/admin/ingest/review",
        {"json": {"fact_id": "missing-fact", "action": "approve"}},
    ),
]


class StaticJwksClient:
    def get_signing_key_from_jwt(self, _token: str) -> SimpleNamespace:
        return SimpleNamespace(key=_PUBLIC_KEY)


@pytest.fixture(autouse=True)
def static_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_get_jwks_client", lambda _url: StaticJwksClient())


def make_token(
    subject: str = "owner-user-id",
    *,
    issuer: str = _ISSUER,
    audience: str = "authenticated",
    expires_at: datetime | None = None,
    key: Any = _PRIVATE_KEY,
) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": subject,
        "iss": issuer,
        "aud": audience,
        "iat": int(now.timestamp()),
        "exp": int((expires_at or now + timedelta(minutes=5)).timestamp()),
    }
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})


def request_admin(
    client: TestClient,
    method: str,
    path: str,
    kwargs: dict[str, Any],
    token: str | None = None,
):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.request(method, path, headers=headers, **kwargs)


@pytest.mark.parametrize(("method", "path", "kwargs"), ADMIN_REQUESTS)
def test_admin_endpoints_require_authentication(
    client: TestClient, method: str, path: str, kwargs: dict[str, Any]
) -> None:
    response = request_admin(client, method, path, kwargs)
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path", "kwargs"), ADMIN_REQUESTS)
def test_admin_endpoints_reject_invalid_tokens(
    client: TestClient, method: str, path: str, kwargs: dict[str, Any]
) -> None:
    response = request_admin(client, method, path, kwargs, "not-a-valid-jwt")
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path", "kwargs"), ADMIN_REQUESTS)
def test_admin_endpoints_reject_authenticated_non_owners(
    client: TestClient, method: str, path: str, kwargs: dict[str, Any]
) -> None:
    response = request_admin(
        client, method, path, kwargs, make_token(subject="different-user-id")
    )
    assert response.status_code == 403


def test_owner_can_access_admin_api(client: TestClient) -> None:
    token = make_token()
    identity = request_admin(client, "GET", "/api/admin/auth/me", {}, token)
    status = request_admin(client, "GET", "/api/admin/ingest/status", {}, token)

    assert identity.status_code == 200
    assert identity.json() == {"authenticated": True}
    assert status.status_code == 200


def test_signed_token_with_wrong_issuer_is_rejected(client: TestClient) -> None:
    response = request_admin(
        client,
        "GET",
        "/api/admin/ingest/status",
        {},
        make_token(issuer="https://attacker.example/auth/v1"),
    )
    assert response.status_code == 401


def test_signed_expired_token_is_rejected(client: TestClient) -> None:
    response = request_admin(
        client,
        "GET",
        "/api/admin/ingest/status",
        {},
        make_token(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)),
    )
    assert response.status_code == 401


def test_admin_approval_cannot_be_reached_directly_by_non_owner(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail_if_called(*_args: Any, **_kwargs: Any) -> None:
        pytest.fail("Review handler must not run for non-owners.")

    monkeypatch.setattr("app.api.routes.review_fact", fail_if_called)
    response = request_admin(
        client,
        "POST",
        "/api/admin/ingest/review",
        {"json": {"fact_id": "some-fact", "action": "approve"}},
        make_token(subject="different-user-id"),
    )
    assert response.status_code == 403


def test_public_chat_and_profile_remain_accessible(client: TestClient) -> None:
    profile = client.get("/api/profile")
    chat = client.post("/api/chat", json={"question": "Tell me about yourself."})

    assert profile.status_code == 200
    assert chat.status_code == 200
