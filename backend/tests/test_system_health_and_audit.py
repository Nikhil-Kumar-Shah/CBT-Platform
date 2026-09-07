import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.audit_log import AuditEvent
from backend.app.services.audit_service import AuditService, sanitize_audit_details
from backend.app.core.config import settings


def test_system_health_endpoint(client: TestClient):
    """Verify /api/v1/health returns comprehensive operational health data for all 10 subsystems."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()

    assert "status" in data
    assert data["status"] in ("ok", "OPERATIONAL", "DEGRADED", "OFFLINE")
    assert data["system_status"] in ("OPERATIONAL", "DEGRADED", "OFFLINE")
    assert "server_time" in data
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0
    assert "uptime_human" in data
    assert "last_successful_check" in data

    # Check database and API blocks
    assert "database" in data
    db_info = data.get("database_details") or data["subsystems"]["database"]
    assert db_info["connected"] is True
    assert isinstance(db_info["latency_ms"], (int, float))
    assert db_info["latency_ms"] >= 0

    assert "api" in data
    assert data["api"]["status"] == "OPERATIONAL"
    assert isinstance(data["api"]["latency_ms"], (int, float))

    # Verify all 10 required subsystems are present
    subsystems = data.get("subsystems", {})
    required_subsystems = [
        "application_server",
        "database",
        "api",
        "frontend",
        "authentication",
        "exam_service",
        "autosave",
        "submission_and_evaluation",
        "integrity_monitoring",
        "file_media_storage",
    ]
    for sub in required_subsystems:
        assert sub in subsystems, f"Subsystem {sub} missing from health response"
        assert "status" in subsystems[sub]
        assert "message" in subsystems[sub]

    # No sensitive connection strings or passwords leaked
    raw_text = response.text
    assert "postgres:" not in raw_text
    assert "password" not in raw_text.lower()
    assert "secret" not in raw_text.lower()


def test_database_health_endpoint(client: TestClient):
    """Verify /api/v1/health/database executes a lightweight query and reports actual latency."""
    response = client.get("/api/v1/health/database")
    assert response.status_code == 200
    data = response.json()

    assert data["connected"] is True
    assert data["status"] == "OPERATIONAL"
    assert "latency_ms" in data
    assert isinstance(data["latency_ms"], (int, float))
    assert data["latency_ms"] >= 0
    assert "Database connection operational." in data["message"]


def test_failed_database_health_handling(client: TestClient):
    """Verify that if database probe fails, health endpoint returns 503 with safe human-readable message without leaking stack traces."""
    with patch("backend.app.api.v1.health.check_database_latency") as mock_probe:
        mock_probe.return_value = (False, -1.0, "Database connection is unavailable.")
        response = client.get("/api/v1/health/database")
        assert response.status_code == 503
        data = response.json()
        assert data["connected"] is False
        assert data["status"] == "OFFLINE"
        assert data["message"] == "Database connection is unavailable."
        # Confirm no raw stack trace or connection string is exposed
        assert "Traceback" not in response.text
        assert "psycopg" not in response.text


def test_audit_service_sanitization():
    """Verify sensitive fields like passwords, tokens, and full access codes are redacted before storage."""
    raw_data = {
        "username": "candidate_1",
        "password": "SuperSecretPassword123!",
        "token": "sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        "access_code": "PHY-MOCK-7K42",
        "nested": {
            "secret_key": "raw_secret",
            "safe_val": 42,
        },
    }
    sanitized = sanitize_audit_details(raw_data)
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["token"] == "[REDACTED]"
    assert "PHY" in sanitized["access_code"]
    assert "****" in sanitized["access_code"]
    assert sanitized["nested"]["secret_key"] == "[REDACTED]"
    assert sanitized["nested"]["safe_val"] == 42


def test_audit_service_logging_and_retrieval(db_session: Session):
    """Verify AuditService creates append-only records with all metadata fields."""
    event = AuditService.log(
        db=db_session,
        event_type="TEST_CREATED",
        category="ADMIN",
        severity="INFO",
        actor="pytest_admin",
        actor_type="ADMIN",
        action="CREATE",
        resource_type="TEST",
        resource_id="test-12345",
        description="Created Physics Mock Test Paper",
        ip_address="127.0.0.1",
        session_id="sess_123",
        details={"positive_marks": 4, "duration": 60},
    )
    db_session.commit()

    assert event.id is not None
    assert event.event_type == "TEST_CREATED"
    assert event.category == "ADMIN"
    assert event.severity == "INFO"
    assert event.actor == "pytest_admin"
    assert event.resource_id == "test-12345"
    assert event.details["positive_marks"] == 4

    # Fetch through service
    fetched = AuditService.get_event(db_session, event.id)
    assert fetched is not None
    assert fetched.id == event.id


def test_audit_api_requires_admin(client: TestClient):
    """Verify /api/v1/audit is protected and rejects anonymous calls."""
    response = client.get("/api/v1/audit")
    assert response.status_code == 401


def test_audit_api_filtering_and_pagination(client: TestClient, db_session: Session, auth_headers: dict):
    """Verify /api/v1/audit endpoint supports category, severity, search, actor, and pagination."""
    # Seed multiple diverse events
    categories = ["ADMIN", "QUESTIONS", "CANDIDATES", "EXAM", "SECURITY"]
    for i, cat in enumerate(categories):
        AuditService.log(
            db=db_session,
            event_type=f"{cat}_EVENT_{i}",
            category=cat,
            severity="CRITICAL" if cat == "SECURITY" else ("WARNING" if cat == "CANDIDATES" else "INFO"),
            actor=f"user_{cat.lower()}",
            actor_type="ADMIN" if cat in ("ADMIN", "QUESTIONS") else "CANDIDATE",
            action="EXECUTE",
            resource_type="UNIT_TEST",
            resource_id=f"res_{i}",
            description=f"Generated test audit record for {cat}",
        )
    db_session.commit()

    # 1. Fetch all
    res = client.get("/api/v1/audit")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 5

    # 2. Filter by category
    res_sec = client.get("/api/v1/audit?category=SECURITY")
    assert res_sec.status_code == 200
    sec_data = res_sec.json()
    for item in sec_data["items"]:
        assert item["category"] == "SECURITY"

    # 3. Filter by severity
    res_crit = client.get("/api/v1/audit?severity=CRITICAL")
    assert res_crit.status_code == 200
    crit_data = res_crit.json()
    for item in crit_data["items"]:
        assert item["severity"] == "CRITICAL"

    # 4. Search query
    res_search = client.get("/api/v1/audit?search=QUESTIONS")
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["total"] >= 1
    assert any("QUESTIONS" in it["event_type"] or "QUESTIONS" in it["description"] for it in search_data["items"])

    # 5. Pagination
    res_paged = client.get("/api/v1/audit?page=1&page_size=2")
    assert res_paged.status_code == 200
    paged_data = res_paged.json()
    assert len(paged_data["items"]) <= 2
    assert paged_data["page"] == 1
    assert paged_data["page_size"] == 2


def test_audit_append_only_no_delete_or_put(client: TestClient, auth_headers: dict):
    """Verify audit records are immutable and no modification or deletion routes exist."""
    fake_id = str(uuid.uuid4())
    res_delete = client.delete(f"/api/v1/audit/{fake_id}")
    assert res_delete.status_code in (404, 405)

    res_put = client.put(f"/api/v1/audit/{fake_id}", json={"description": "Hacked"})
    assert res_put.status_code in (404, 405)


def test_audit_logging_on_auth_actions(client: TestClient, db_session: Session):
    """Verify login failure, login success, and logout generate universal audit records."""
    # 1. Failed login attempt
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "non_existent_admin", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401

    # Check that failed login generated an audit event
    failed_event = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.event_type == "AUTH_FAILURE")
        .order_by(AuditEvent.timestamp.desc())
        .first()
    )
    assert failed_event is not None
    assert failed_event.category == "SECURITY"
    assert failed_event.severity == "WARNING"
    assert "Failed administrator login attempt" in failed_event.description
