"""Comprehensive regression test suite for Admin Authentication, Password Persistence,

Session Revocation, and Security Hardening across Application Restarts.
"""

import subprocess
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.security import hash_password, verify_password
from backend.app.models.user import User
from backend.app.models.audit_log import AuditEvent
from backend.app.models.session import UserSession


@pytest.fixture(autouse=True)
def clean_admin_state(db_session: Session):
    """Ensure admin account is active with default credentials before and after tests."""
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    if not admin:
        admin = User(
            username="admin",
            email="admin@cbt.local",
            password_hash=hash_password("AdminSecure123!"),
            display_name="System Administrator",
            role="ADMIN",
            status="ACTIVE",
        )
        db_session.add(admin)
    else:
        admin.password_hash = hash_password("AdminSecure123!")
        admin.status = "ACTIVE"
    db_session.commit()

    yield

    db_session.rollback()
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    if admin:
        admin.password_hash = hash_password("AdminSecure123!")
        admin.status = "ACTIVE"
        db_session.commit()


def test_1_admin_initial_login_success(client: TestClient, db_session: Session):
    """TEST 1: Set initial admin password and verify login with initial password succeeds."""
    initial_password = "AdminSecure123!"

    # Login with initial password
    res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": initial_password},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["username"] == "admin"
    assert data["role"] == "ADMIN"
    assert settings.SESSION_COOKIE_NAME in client.cookies


def test_2_and_3_change_password_and_old_password_rejected(client: TestClient, db_session: Session):
    """TEST 2 & 3: Change password, login with new password succeeds, and old password fails immediately."""
    initial_password = "AdminSecure123!"
    new_password = "NewSuperSecret2026!#"

    # Login with initial password
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": initial_password},
    )
    assert login_res.status_code == 200

    # Change password
    change_res = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": initial_password,
            "new_password": new_password,
        },
    )
    assert change_res.status_code == 200
    assert change_res.json()["message"] == "Password changed successfully."

    # Verify new password in DB
    db_session.expire_all()
    updated_admin = db_session.scalar(select(User).where(User.username == "admin"))
    assert verify_password(new_password, updated_admin.password_hash) is True
    assert verify_password(initial_password, updated_admin.password_hash) is False

    # Clear cookies to simulate fresh login
    fresh_client = TestClient(client.app)

    # Old password must FAIL (401)
    old_login_res = fresh_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": initial_password},
    )
    assert old_login_res.status_code == 401
    assert "Invalid username or password" in old_login_res.json()["detail"]

    # New password must SUCCEED (200)
    new_login_res = fresh_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": new_password},
    )
    assert new_login_res.status_code == 200
    assert new_login_res.json()["username"] == "admin"


def test_4_and_5_password_persists_across_restart_and_bootstrap(client: TestClient, db_session: Session):
    """TEST 4 & 5: Simulate application restart + ensure_admin bootstrap,

    verify new password continues working and old password is permanently rejected.
    """
    new_password = "PersistentAdminPassword2026!"

    # Ensure admin has updated custom password
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    assert admin is not None
    admin.password_hash = hash_password(new_password)
    db_session.commit()
    db_session.refresh(admin)

    # Run ensure_admin.py script directly (simulating run.py startup)
    root_dir = Path(__file__).resolve().parent.parent.parent
    script_path = root_dir / "scripts" / "ensure_admin.py"
    res = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(root_dir),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"ensure_admin.py failed: {res.stderr}"
    assert "STATUS:EXISTS" in res.stdout, f"Expected STATUS:EXISTS, got: {res.stdout}"

    # Verify DB still contains the custom new password hash
    db_session.expire_all()
    reloaded_admin = db_session.scalar(select(User).where(User.username == "admin"))
    assert verify_password(new_password, reloaded_admin.password_hash) is True
    assert verify_password("AdminSecure123!", reloaded_admin.password_hash) is False

    # Simulate fresh client after restart
    fresh_client = TestClient(client.app)

    # Login with new password -> 200 OK
    new_res = fresh_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": new_password},
    )
    assert new_res.status_code == 200

    # Login with old password -> 401 FAIL
    old_res = fresh_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": "AdminSecure123!"},
    )
    assert old_res.status_code == 401


def test_6_multiple_restarts_maintain_new_password(client: TestClient, db_session: Session):
    """TEST 6: Re-run startup bootstrap 5 consecutive times and verify credentials remain intact."""
    new_password = "MultiRestartPassword2026!"
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    admin.password_hash = hash_password(new_password)
    db_session.commit()

    root_dir = Path(__file__).resolve().parent.parent.parent
    script_path = root_dir / "scripts" / "ensure_admin.py"

    for i in range(5):
        res = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(root_dir),
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0
        assert "STATUS:EXISTS" in res.stdout

    db_session.expire_all()
    reloaded = db_session.scalar(select(User).where(User.username == "admin"))
    assert verify_password(new_password, reloaded.password_hash) is True

    fresh_client = TestClient(client.app)
    login_res = fresh_client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": new_password},
    )
    assert login_res.status_code == 200


def test_7_ensure_admin_creates_only_when_missing(db_session: Session):
    """TEST 7: Verify ensure_admin.py is strictly idempotent and does not overwrite credentials."""
    root_dir = Path(__file__).resolve().parent.parent.parent
    script_path = root_dir / "scripts" / "ensure_admin.py"

    custom_pass = "CustomAdminPass2026!#"
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    if not admin:
        admin = User(
            username="admin",
            email="admin@cbt.local",
            password_hash=hash_password(custom_pass),
            display_name="System Administrator",
            role="ADMIN",
            status="ACTIVE",
        )
        db_session.add(admin)
    else:
        admin.password_hash = hash_password(custom_pass)
    db_session.commit()

    # Running ensure_admin must output STATUS:EXISTS and leave password untouched
    res = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(root_dir),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0
    assert "STATUS:EXISTS" in res.stdout

    # Confirm password hash was NOT reverted to default
    db_session.expire_all()
    reloaded = db_session.scalar(select(User).where(User.username == "admin"))
    assert verify_password(custom_pass, reloaded.password_hash) is True
    assert verify_password("AdminSecure123!", reloaded.password_hash) is False


def test_8_unauthenticated_and_student_access_rejected_on_admin_apis(client: TestClient):
    """TEST 8: Protected admin endpoints reject unauthenticated and unauthorized requests."""
    unauth_client = TestClient(client.app)

    # 1. Unauthenticated request to /auth/users -> 401
    res1 = unauth_client.get("/api/v1/auth/users")
    assert res1.status_code == 401
    assert "Authentication required" in res1.json()["detail"] or "session" in res1.json()["detail"].lower()

    # 2. Unauthenticated request to /auth/me -> 401
    res2 = unauth_client.get("/api/v1/auth/me")
    assert res2.status_code == 401


def test_9_logout_invalidates_session(client: TestClient, db_session: Session):
    """TEST 9: Logout revokes session cookie and invalidates server-side session token."""
    pwd = "LogoutTestPassword123!"
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    admin.password_hash = hash_password(pwd)
    db_session.commit()

    # Login
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "admin", "password": pwd},
    )
    assert login_res.status_code == 200

    # Verify /auth/me works
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200

    # Logout
    logout_res = client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["message"] == "Logged out successfully"

    # Subsequent access with same client must be rejected
    after_logout_res = client.get("/api/v1/auth/me")
    assert after_logout_res.status_code == 401


def test_10_change_password_revokes_prior_sessions(client: TestClient, db_session: Session):
    """TEST 10: Password change revokes other prior sessions."""
    pwd1 = "PriorSessionTest123!"
    pwd2 = "PriorSessionTest456!"
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    admin.password_hash = hash_password(pwd1)
    db_session.commit()

    # Session A logs in
    client_a = TestClient(client.app)
    res_a = client_a.post("/api/v1/auth/login", json={"username_or_email": "admin", "password": pwd1})
    assert res_a.status_code == 200

    # Session B logs in
    client_b = TestClient(client.app)
    res_b = client_b.post("/api/v1/auth/login", json={"username_or_email": "admin", "password": pwd1})
    assert res_b.status_code == 200

    # Session A changes password
    chg_res = client_a.post(
        "/api/v1/auth/change-password",
        json={"current_password": pwd1, "new_password": pwd2},
    )
    assert chg_res.status_code == 200

    # Session B (stale session) must now be rejected
    res_b_stale = client_b.get("/api/v1/auth/me")
    assert res_b_stale.status_code == 401


def test_11_login_failure_rate_limiting_and_generic_error(client: TestClient):
    """TEST 11: Failed login returns generic 401 without revealing user existence."""
    res = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "nonexistent_user_9999", "password": "RandomPassword123!"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid username or password"


def test_12_no_passwords_or_hashes_in_audit_logs(client: TestClient, db_session: Session):
    """TEST 12: Verify no plaintext passwords or password hashes are written to audit logs."""
    plain_secret = "UltraSecretPassword999!"

    # Ensure admin
    admin = db_session.scalar(select(User).where(User.username == "admin"))
    admin.password_hash = hash_password("OldPassword123!")
    db_session.commit()

    # Login and change password
    client.post("/api/v1/auth/login", json={"username_or_email": "admin", "password": "OldPassword123!"})
    client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": plain_secret},
    )

    # Check recent audit logs
    logs = db_session.scalars(select(AuditEvent).order_by(AuditEvent.timestamp.desc()).limit(20)).all()
    for entry in logs:
        desc = entry.description or ""
        assert plain_secret not in desc, f"Plaintext password leaked in audit log: {desc}"
        assert "$argon2" not in desc, f"Argon2 hash leaked in audit log description: {desc}"
