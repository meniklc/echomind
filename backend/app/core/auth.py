"""Supabase access-token verification and owner authorization."""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWKClientConnectionError
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings

bearer_scheme = HTTPBearer(auto_error=False)
ASYMMETRIC_ALGORITHMS = ("ES256", "RS256", "EdDSA")


@lru_cache(maxsize=4)
def _get_jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=300, timeout=5)


def verify_supabase_access_token(token: str, settings: Settings) -> Dict[str, Any]:
    """Verify a Supabase JWT signature and its issuer, audience, and lifetime."""
    if not settings.supabase_url.strip():
        raise RuntimeError("Supabase Auth is not configured.")

    issuer = f"{settings.supabase_url.strip().rstrip('/')}/auth/v1"
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")

    if algorithm == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("Unsupported signing key configuration.")
        signing_key: Any = settings.supabase_jwt_secret
    elif algorithm in ASYMMETRIC_ALGORITHMS:
        jwks_url = f"{issuer}/.well-known/jwks.json"
        signing_key = _get_jwks_client(jwks_url).get_signing_key_from_jwt(token).key
    else:
        raise jwt.InvalidTokenError("Unsupported signing algorithm.")

    claims = jwt.decode(
        token,
        signing_key,
        algorithms=[algorithm],
        audience=settings.supabase_jwt_audience,
        issuer=issuer,
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
    )
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise jwt.InvalidTokenError("Missing user identity.")
    return claims


async def require_owner(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Dict[str, Any]:
    """Require a valid Supabase user token whose subject is on the owner allowlist."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Sign-in is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings: Settings = getattr(request.app.state, "settings", None)
    if settings is None:
        from app.core.config import get_settings

        settings = get_settings()

    try:
        claims = await run_in_threadpool(
            verify_supabase_access_token, credentials.credentials, settings
        )
    except PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=503,
            detail="Authentication verification is temporarily unavailable.",
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured.",
        ) from exc

    if claims["sub"] not in settings.owner_user_id_list:
        raise HTTPException(status_code=403, detail="Owner access is required.")
    return claims
