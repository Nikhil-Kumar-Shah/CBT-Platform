import os
import pytest
from typing import Generator
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models.base import Base
from backend.app.models.user import User
from backend.app.models.session import UserSession
from backend.app.core.security import hash_password
from backend.app.main import app

import socket

# Enable TESTING flag for test suite
settings.TESTING = True

def _is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False

# Ensure PostgreSQL on port 5433 is running before initializing test engine
if not _is_port_open(5433):
    try:
        from run_platform import ensure_database
        ensure_database(port=5433)
    except Exception:
        pass

# Test database engine using the configured test/dev database
test_engine = create_engine(
    settings.effective_database_url,
    connect_args={"connect_timeout": 5} if "postgres" in settings.effective_database_url else {},
    pool_pre_ping=True,
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
    expire_on_commit=False,
)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Ensure tables exist before tests run and flush cleanly on completion."""
    try:
        from backend.app.core.db_bootstrap import bootstrap_postgres_database
        bootstrap_postgres_database(raise_on_failure=False)
    except Exception:
        pass
    Base.metadata.create_all(bind=test_engine)
    yield
    try:
        with test_engine.connect() as conn:
            conn.execute(text("CHECKPOINT"))
    except Exception:
        pass


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide a transactional database session for each test."""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, base_url="http://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_admin(db_session: Session) -> User:
    """Fixture providing a known active admin user."""
    user = User(
        username="pytest_admin",
        email="pytest_admin@example.com",
        password_hash=hash_password("SecretAdminPass123!"),
        display_name="Pytest Admin",
        role="ADMIN",
        status="ACTIVE",
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def test_disabled_admin(db_session: Session) -> User:
    """Fixture providing a disabled admin user."""
    user = User(
        username="disabled_admin",
        email="disabled_admin@example.com",
        password_hash=hash_password("SecretAdminPass123!"),
        display_name="Disabled Admin",
        role="ADMIN",
        status="DISABLED",
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def auth_headers(client: TestClient, test_admin: User) -> dict:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": test_admin.username, "password": "SecretAdminPass123!"},
    )
    assert resp.status_code == 200
    token = resp.cookies[settings.SESSION_COOKIE_NAME]
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    return {}

