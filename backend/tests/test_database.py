import uuid
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.models.user import User
from backend.app.models.session import UserSession
from backend.app.core.security import hash_password, generate_session_token, hash_session_token


def test_database_connection(db_session: Session):
    result = db_session.execute(text("SELECT 1")).scalar()
    assert result == 1


def test_create_user(db_session: Session):
    user = User(
        username="db_user_1",
        email="db_user_1@cbt.local",
        password_hash=hash_password("Pass1234!"),
        display_name="DB User One",
        role="ADMIN",
        status="ACTIVE",
    )
    db_session.add(user)
    db_session.flush()

    assert user.id is not None
    assert user.created_at is not None
    assert user.updated_at is not None
    assert user.is_active() is True
    assert user.is_admin() is True


def test_unique_username_constraint(db_session: Session):
    u1 = User(
        username="duplicate_user",
        email="u1@cbt.local",
        password_hash=hash_password("Pass1234!"),
        display_name="User 1",
    )
    db_session.add(u1)
    db_session.flush()

    u2 = User(
        username="duplicate_user",
        email="u2@cbt.local",
        password_hash=hash_password("Pass1234!"),
        display_name="User 2",
    )
    db_session.add(u2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_unique_email_constraint(db_session: Session):
    u1 = User(
        username="user_a",
        email="same_email@cbt.local",
        password_hash=hash_password("Pass1234!"),
        display_name="User A",
    )
    db_session.add(u1)
    db_session.flush()

    u2 = User(
        username="user_b",
        email="same_email@cbt.local",
        password_hash=hash_password("Pass1234!"),
        display_name="User B",
    )
    db_session.add(u2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_session_relationship_and_cascade(db_session: Session):
    user = User(
        username="session_test_user",
        email="session_test@cbt.local",
        password_hash=hash_password("Pass1234!"),
        display_name="Session User",
    )
    db_session.add(user)
    db_session.flush()

    token = generate_session_token()
    token_hash = hash_session_token(token)
    now = datetime.now(timezone.utc)

    user_session = UserSession(
        user_id=user.id,
        session_token_hash=token_hash,
        expires_at=now + timedelta(hours=1),
        ip_address="127.0.0.1",
        user_agent="pytest/test",
    )
    db_session.add(user_session)
    db_session.flush()

    assert user_session.id is not None
    assert user_session.user.username == "session_test_user"
    assert user_session.is_valid(now) is True

    session_id = user_session.id
    # Deleting user should cascade delete user session
    db_session.delete(user)
    db_session.flush()

    assert db_session.get(UserSession, session_id) is None
