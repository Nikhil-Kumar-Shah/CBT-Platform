from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.security import hash_session_token
from backend.app.models.user import User
from backend.app.models.session import UserSession


def test_login_success_with_username(client: TestClient, test_admin: User):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_admin.username,
            "password": "SecretAdminPass123!",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == test_admin.username
    assert data["email"] == test_admin.email
    assert data["role"] == "ADMIN"
    assert "password_hash" not in data
    assert "password" not in data

    # Verify session cookie
    assert settings.SESSION_COOKIE_NAME in response.cookies
    cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert len(cookie) >= 32


def test_login_success_with_email(client: TestClient, test_admin: User):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_admin.email,
            "password": "SecretAdminPass123!",
        },
    )
    assert response.status_code == 200
    assert settings.SESSION_COOKIE_NAME in response.cookies


def test_login_invalid_password(client: TestClient, test_admin: User):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_admin.username,
            "password": "IncorrectPassword999!",
        },
    )
    assert response.status_code == 401
    assert "Invalid username or password" in response.json()["detail"]
    assert settings.SESSION_COOKIE_NAME not in response.cookies


def test_login_nonexistent_user(client: TestClient):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "nonexistent_admin",
            "password": "AnyPassword123!",
        },
    )
    assert response.status_code == 401
    assert "Invalid username or password" in response.json()["detail"]


def test_login_disabled_user(client: TestClient, test_disabled_admin: User):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_disabled_admin.username,
            "password": "SecretAdminPass123!",
        },
    )
    assert response.status_code == 401


def test_me_unauthenticated(client: TestClient):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "Authentication required" in response.json()["detail"]


def test_me_authenticated(client: TestClient, test_admin: User):
    # Login first
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_admin.username,
            "password": "SecretAdminPass123!",
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.cookies[settings.SESSION_COOKIE_NAME]

    # Call /me with cookie
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    user_data = me_resp.json()
    assert user_data["username"] == test_admin.username
    assert user_data["email"] == test_admin.email
    assert "password_hash" not in user_data


def test_logout_revokes_session(client: TestClient, test_admin: User, db_session: Session):
    # Login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_admin.username,
            "password": "SecretAdminPass123!",
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.cookies[settings.SESSION_COOKIE_NAME]
    token_hash = hash_session_token(token)

    # Logout
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    logout_resp = client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

    # Verify session is revoked in DB
    session = db_session.scalar(
        select(UserSession).where(UserSession.session_token_hash == token_hash)
    )
    assert session is not None
    assert session.revoked_at is not None

    # Subsequent request with old token should fail with 401
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 401


def test_expired_session_rejected(client: TestClient, test_admin: User, db_session: Session):
    # Manually insert expired session
    expired_token = "some_random_expired_token_value_abc123"
    token_hash = hash_session_token(expired_token)
    now = datetime.now(timezone.utc)

    expired_session = UserSession(
        user_id=test_admin.id,
        session_token_hash=token_hash,
        created_at=now - timedelta(days=2),
        expires_at=now - timedelta(days=1),
        last_seen_at=now - timedelta(days=1),
    )
    db_session.add(expired_session)
    db_session.flush()

    client.cookies.set(settings.SESSION_COOKIE_NAME, expired_token)
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_raw_token_never_stored_in_database(client: TestClient, test_admin: User, db_session: Session):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": test_admin.username,
            "password": "SecretAdminPass123!",
        },
    )
    raw_token = login_resp.cookies[settings.SESSION_COOKIE_NAME]

    # Ensure raw_token is NOT found directly in session_token_hash column
    direct_match = db_session.scalar(
        select(UserSession).where(UserSession.session_token_hash == raw_token)
    )
    assert direct_match is None

    # But its SHA-256 hash IS found
    token_hash = hash_session_token(raw_token)
    hash_match = db_session.scalar(
        select(UserSession).where(UserSession.session_token_hash == token_hash)
    )
    assert hash_match is not None
    assert hash_match.user_id == test_admin.id
