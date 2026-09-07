import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.user import User
from backend.app.models.test import Test


@pytest.fixture
def sample_subject(db_session: Session) -> Subject:
    subj = Subject(name="Physics Mechanics", code="PHY-MECH", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)
    return subj


@pytest.fixture
def published_exam_setup(client: TestClient, db_session: Session, test_admin: User, auth_headers, sample_subject: Subject):
    """Creates and publishes an exam with questions and returns its details."""
    # 1. Create Test in DRAFT
    create_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Kinematics & Dynamics Assessment",
            "subject_id": str(sample_subject.id),
            "duration_minutes": 60,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
            "result_visibility": "IMMEDIATELY",
            "allow_resume": True,
        },
    )
    assert create_resp.status_code == 201
    test_data = create_resp.json()
    test_id = test_data["id"]

    # 2. Add Question
    q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the acceleration due to gravity on Earth (approx)?",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "9.8 m/s^2", "is_correct": True},
                {"option_order": 2, "content": "1.6 m/s^2", "is_correct": False},
                {"option_order": 3, "content": "3.7 m/s^2", "is_correct": False},
                {"option_order": 4, "content": "0 m/s^2", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201

    # 3. Publish Test
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()

    assert pub_data["status"] == "LIVE"
    assert "code" in pub_data
    access_code = pub_data["code"]
    assert len(access_code) > 0

    return {
        "test_id": test_id,
        "access_code": access_code,
        "title": test_data["title"],
    }


def test_admin_publish_generates_exact_code_stored_in_db(client: TestClient, published_exam_setup, db_session: Session):
    """Test that publishing generates an access code that is stored identically in the database."""
    test_id = published_exam_setup["test_id"]
    access_code = published_exam_setup["access_code"]

    db_test = db_session.query(Test).filter(Test.id == uuid.UUID(test_id)).first()
    assert db_test is not None
    assert db_test.status == "LIVE"
    assert db_test.code == access_code
    assert db_test.code.isupper()


def test_student_portal_verify_access_exact_code(client: TestClient, published_exam_setup):
    """Verify published exam is accessible using exact code via GET and POST."""
    access_code = published_exam_setup["access_code"]

    # GET /attempts/verify-access
    get_resp = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["code"] == access_code
    assert data["title"] == published_exam_setup["title"]
    assert data["duration_minutes"] == 60
    assert data["total_questions"] == 1

    # POST /attempts/verify-access
    post_resp = client.post("/api/v1/attempts/verify-access", json={"code": access_code})
    assert post_resp.status_code == 200
    assert post_resp.json()["code"] == access_code


def test_student_portal_verify_code_case_insensitivity(client: TestClient, published_exam_setup):
    """Verify lowercase and mixed case access codes are resolved accurately."""
    access_code = published_exam_setup["access_code"]
    lower_code = access_code.lower()

    resp = client.get(f"/api/v1/attempts/verify-access?code={lower_code}")
    assert resp.status_code == 200
    assert resp.json()["code"] == access_code


def test_student_portal_verify_code_whitespace_and_hyphen_tolerance(client: TestClient, published_exam_setup):
    """Verify leading/trailing whitespace, spaces between parts, and missing hyphens resolve."""
    access_code = published_exam_setup["access_code"]

    # Leading/trailing whitespace
    resp_ws = client.get(f"/api/v1/attempts/verify-access?code=%20%20{access_code}%20%20")
    assert resp_ws.status_code == 200
    assert resp_ws.json()["code"] == access_code

    # Spaces around hyphens: 'PHY - MOCK - XXXX'
    spaced_code = access_code.replace("-", " - ")
    resp_spaced = client.post("/api/v1/attempts/verify-access", json={"code": spaced_code})
    assert resp_spaced.status_code == 200
    assert resp_spaced.json()["code"] == access_code

    # Stripped hyphens: 'PHYMOCKXXXX'
    unhyphenated = access_code.replace("-", "")
    resp_unhyphenated = client.get(f"/api/v1/attempts/verify-access?code={unhyphenated}")
    assert resp_unhyphenated.status_code == 200
    assert resp_unhyphenated.json()["code"] == access_code


def test_student_portal_verify_code_pasted_url(client: TestClient, published_exam_setup):
    """Verify pasting the entire student portal URL into the code input resolves properly."""
    access_code = published_exam_setup["access_code"]
    full_url = f"http://127.0.0.1:3000/exam?code={access_code}"

    resp = client.post("/api/v1/attempts/verify-access", json={"code": full_url})
    assert resp.status_code == 200
    assert resp.json()["code"] == access_code


def test_reject_internal_database_id_as_access_credential(client: TestClient, published_exam_setup):
    """Verify internal UUID database IDs are rejected cleanly and do not expose or leak exams."""
    test_id = published_exam_setup["test_id"]

    resp = client.get(f"/api/v1/attempts/verify-access?code={test_id}")
    assert resp.status_code == 400
    error_msg = resp.json()["detail"]
    assert "internal examination ID" in error_msg
    assert "not a candidate access code" in error_msg


def test_reject_unpublished_draft_exam(client: TestClient, db_session: Session, test_admin: User, auth_headers, sample_subject: Subject):
    """Verify DRAFT exams cannot be verified or accessed by candidate codes."""
    # Create draft test
    create_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Unpublished Draft Test",
            "subject_id": str(sample_subject.id),
            "duration_minutes": 30,
        },
    )
    assert create_resp.status_code == 201
    draft_code = create_resp.json()["code"]

    resp = client.get(f"/api/v1/attempts/verify-access?code={draft_code}")
    assert resp.status_code == 400
    assert "draft" in resp.json()["detail"].lower()


def test_reject_archived_or_closed_exam(client: TestClient, published_exam_setup, db_session: Session):
    """Verify archived or closed exams cannot be accessed."""
    test_id = published_exam_setup["test_id"]
    access_code = published_exam_setup["access_code"]

    db_test = db_session.query(Test).filter(Test.id == uuid.UUID(test_id)).first()
    db_test.status = "ARCHIVED"
    db_session.commit()

    resp = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert resp.status_code == 400
    assert "archived" in resp.json()["detail"].lower()

    db_test.status = "COMPLETED"
    db_session.commit()

    resp_closed = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert resp_closed.status_code == 400
    assert "closed" in resp_closed.json()["detail"].lower() or "concluded" in resp_closed.json()["detail"].lower()


def test_reject_expired_scheduled_exam(client: TestClient, published_exam_setup, db_session: Session):
    """Verify exam past its scheduled end_time is rejected."""
    test_id = published_exam_setup["test_id"]
    access_code = published_exam_setup["access_code"]

    db_test = db_session.query(Test).filter(Test.id == uuid.UUID(test_id)).first()
    db_test.end_time = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.commit()

    resp = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert resp.status_code == 400
    assert "scheduled window for this examination has passed" in resp.json()["detail"]


def test_future_scheduled_exam_returns_lobby_and_blocks_early_start(client: TestClient, published_exam_setup, db_session: Session):
    """Verify exam before its scheduled start_time returns lobby countdown data on verify and rejects early start."""
    test_id = published_exam_setup["test_id"]
    access_code = published_exam_setup["access_code"]

    db_test = db_session.query(Test).filter(Test.id == uuid.UUID(test_id)).first()
    db_test.start_time = datetime.now(timezone.utc) + timedelta(hours=5)
    db_session.commit()

    resp = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == access_code
    assert data["can_start"] is False
    assert data["is_lobby_open"] is True

    # Candidate attempting to start early is rejected cleanly
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Early Student",
            "candidate_email": "early@test.com",
            "candidate_roll_number": "R-101",
        },
    )
    assert start_resp.status_code == 400
    assert "Your examination hasn't started yet" in start_resp.json()["detail"]


def test_reject_nonexistent_access_code(client: TestClient):
    """Verify invalid access code returns 404."""
    resp = client.get("/api/v1/attempts/verify-access?code=DOES-NOT-EXIST-999")
    assert resp.status_code == 404
    assert "No examination found with access code" in resp.json()["detail"]


def test_end_to_end_publish_to_student_start_attempt(client: TestClient, published_exam_setup):
    """Verify complete flow: verified access code -> register candidate -> start attempt."""
    access_code = published_exam_setup["access_code"]

    # 1. Verify access code
    verify_resp = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert verify_resp.status_code == 200
    test_info = verify_resp.json()
    assert test_info["code"] == access_code

    # 2. Register candidate and start attempt
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Nikita Sharma",
            "candidate_email": "nikita.sharma@example.com",
            "roll_number": "ROLL-2026-001",
        },
    )
    assert start_resp.status_code == 201
    attempt_data = start_resp.json()
    assert "attempt_id" in attempt_data
    assert "session_id" in attempt_data
    assert attempt_data["status"] == "IN_PROGRESS"
    assert len(attempt_data["questions"]) == 1
    assert attempt_data["questions"][0]["content"] == "What is the acceleration due to gravity on Earth (approx)?"

    # 3. Resume attempt with same credentials
    resume_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Nikita Sharma",
            "candidate_email": "nikita.sharma@example.com",
            "roll_number": "ROLL-2026-001",
        },
    )
    assert resume_resp.status_code in (200, 201)
    resumed_data = resume_resp.json()
    assert resumed_data["attempt_id"] == attempt_data["attempt_id"]
    assert resumed_data["status"] == "IN_PROGRESS"
