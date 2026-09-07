import uuid
import time
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.core.security import hash_password, generate_session_token, hash_session_token
from backend.app.models.user import User
from backend.app.models.session import UserSession
from backend.app.models.subject import Subject
from backend.app.models.test_series import TestSeries
from backend.app.models.test import Test
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.test_question import TestQuestion
from backend.app.models.test_attempt import TestAttempt
from backend.app.models.attempt_integrity_event import AttemptIntegrityEvent


@pytest.fixture
def e2e_admin(db_session: Session):
    admin = User(
        username=f"e2e_admin_{uuid.uuid4().hex[:8]}",
        email=f"e2e_admin_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("StrongAdminPass123!"),
        role="ADMIN",
        status="ACTIVE",
        display_name="E2E Admin",
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    token = generate_session_token()
    token_hash = hash_session_token(token)
    session = UserSession(
        user_id=admin.id,
        session_token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
    )
    db_session.add(session)
    db_session.commit()
    return {"admin": admin, "token": token}


def test_complete_e2e_examination_lifecycle_and_verification(client: TestClient, db_session: Session, e2e_admin):
    """E2E Test: Full Teacher creation -> Scheduling -> Student 5-min lobby -> Exam -> Integrity -> Evaluation -> Results -> CSV."""
    auth_headers = {"Authorization": f"Bearer {e2e_admin['token']}"}

    # =========================================================================
    # 1. TEACHER: Subject, Series, Test Creation
    # =========================================================================
    subj_res = client.post(
        "/api/v1/subjects/",
        headers=auth_headers,
        json={"name": f"Physics_{uuid.uuid4().hex[:6]}", "code": f"P{uuid.uuid4().hex[:5].upper()}"},
    )
    assert subj_res.status_code == 201
    subject_id = subj_res.json()["id"]

    series_res = client.post(
        "/api/v1/test-series/",
        headers=auth_headers,
        json={"name": "JEE Main Final Revision 2026", "target_exam": "JEE Main"},
    )
    assert series_res.status_code == 201
    series_id = series_res.json()["id"]

    test_res = client.post(
        "/api/v1/tests/",
        headers=auth_headers,
        json={
            "title": "Full Physics Mock Test",
            "subject_id": subject_id,
            "series_id": series_id,
            "duration_minutes": 60,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
            "instructions": "Standard CBT exam. No calculators allowed.",
            "show_answers": True,
            "show_explanation": True,
        },
    )
    assert test_res.status_code == 201
    test_data = test_res.json()
    test_id = test_data["id"]
    assert test_data["status"] == "DRAFT"

    # =========================================================================
    # 2. TEACHER: Question Bank & Inline Sync (MCQ + Numerical)
    # =========================================================================
    # Question 1: MCQ
    q1_res = client.post(
        "/api/v1/questions",
        headers=auth_headers,
        json={
            "subject_id": subject_id,
            "question_type": "MCQ",
            "difficulty": "MEDIUM",
            "content": "What is the dimensional formula for Planck's constant $h$?",
            "explanation": "Energy $E = h\\nu$, so $[h] = [ML^2T^{-1}]$.",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "$[ML^2T^{-1}]$", "is_correct": True},
                {"option_order": 2, "content": "$[MLT^{-1}]$", "is_correct": False},
                {"option_order": 3, "content": "$[ML^2T^{-2}]$", "is_correct": False},
                {"option_order": 4, "content": "$[ML^0T^{-1}]$", "is_correct": False},
            ],
        },
    )
    assert q1_res.status_code == 201
    q1_id = q1_res.json()["id"]

    # Question 2: Numerical
    q2_res = client.post(
        "/api/v1/questions",
        headers=auth_headers,
        json={
            "subject_id": subject_id,
            "question_type": "NUMERICAL",
            "difficulty": "HARD",
            "content": "A particle moves with acceleration $a = 6t$. If $v(0) = 2$, find $v(2)$.",
            "explanation": "$v(t) = 3t^2 + 2$. At $t=2$, $v = 3(4) + 2 = 14$.",
            "numerical_answer": 14.0,
            "numerical_tolerance": 0.1,
            "marks": 4.0,
            "negative_marks": 0.0,
        },
    )
    assert q2_res.status_code == 201
    q2_id = q2_res.json()["id"]

    # Attach questions to test paper
    sync_res = client.put(
        f"/api/v1/tests/{test_id}/questions",
        headers=auth_headers,
        json={
            "questions": [
                {"question_id": q1_id, "order_index": 1, "marks": 4.0, "negative_marks": 1.0},
                {"question_id": q2_id, "order_index": 2, "marks": 4.0, "negative_marks": 0.0},
            ]
        },
    )
    assert sync_res.status_code == 200
    assert len(sync_res.json()["questions"]) == 2

    # =========================================================================
    # 3. TEACHER: Scheduling, Rescheduling & Publishing
    # =========================================================================
    now = datetime.now(timezone.utc)
    # Schedule for 3 minutes from now (inside the 5-minute lobby window)
    sched_start = now + timedelta(minutes=3)
    sched_end = sched_start + timedelta(hours=2)

    sched_res = client.post(
        f"/api/v1/tests/{test_id}/schedule",
        headers=auth_headers,
        json={
            "start_time": sched_start.isoformat(),
            "end_time": sched_end.isoformat(),
        },
    )
    assert sched_res.status_code == 200
    assert sched_res.json()["status"] == "SCHEDULED"

    # Publish examination
    pub_res = client.post(f"/api/v1/tests/{test_id}/publish", headers=auth_headers)
    assert pub_res.status_code == 200
    access_code = pub_res.json()["code"]
    assert access_code is not None

    # =========================================================================
    # 4. STUDENT: Access Code Verification & 5-minute Lobby
    # =========================================================================
    # Tolerates whitespace and lowercase
    verify_res = client.post(
        "/api/v1/attempts/verify-code",
        json={"access_code": f"  {access_code.lower()}  "},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["title"] == "Full Physics Mock Test"
    assert verify_data["is_lobby_open"] is True
    assert verify_data["server_now"] is not None

    # Fast-forward test to LIVE for immediate testing
    db_test = db_session.get(Test, uuid.UUID(test_id))
    db_test.status = "LIVE"
    db_test.start_time = now - timedelta(minutes=1)
    db_session.commit()

    # =========================================================================
    # 5. STUDENT: Exam Start & Question Palette
    # =========================================================================
    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Aarav Sharma",
            "candidate_email": "aarav@example.com",
            "candidate_phone": "9876543210",
        },
    )
    assert start_res.status_code == 201
    attempt_data = start_res.json()
    attempt_id = attempt_data["attempt_id"]
    session_id = attempt_data["session_id"]
    questions = attempt_data["questions"]
    assert len(questions) == 2
    # Ensure correct answers are strictly NOT present in candidate payload
    for q in questions:
        assert "is_correct" not in str(q.get("options", []))

    # =========================================================================
    # 6. STUDENT: Answer Saving & Integrity Telemetry
    # =========================================================================
    # Answer Question 1 (Pick correct option)
    q1_opt_id = str(questions[0]["options"][0]["id"])
    ans1_res = client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q1_id,
            "selected_option_ids": q1_opt_id,
            "current_question_index": 0,
        },
    )
    assert ans1_res.status_code == 200
    assert ans1_res.json()["status"] == "SAVED"

    # Answer Question 2 (Numerical answer = 14)
    ans2_res = client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q2_id,
            "numerical_answer": 14.0,
            "current_question_index": 1,
        },
    )
    assert ans2_res.status_code == 200
    assert ans2_res.json()["status"] == "SAVED"

    # Report integrity telemetry (Tab switch)
    event_res = client.post(
        f"/api/v1/attempts/{attempt_id}/integrity-events",
        json={
            "events": [
                {
                    "event_type": "tab_switched",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "duration_seconds": 3.5,
                    "session_id": session_id,
                }
            ]
        },
    )
    assert event_res.status_code == 200
    assert len(event_res.json()) == 1

    # =========================================================================
    # 7. STUDENT: Submission & Authoritative Grading
    # =========================================================================
    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_res.status_code == 200
    res_data = submit_res.json()
    assert res_data["status"] == "COMPLETED"
    # Q1 (+4) and Q2 (+4) -> Total score = 8.0
    assert res_data["score"] == 8.0
    assert res_data["total_marks"] == 8.0
    assert res_data["percentage"] == 100.0

    # =========================================================================
    # 8. RESULTS: Student Result & Admin Inspection
    # =========================================================================
    result_res = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}")
    assert result_res.status_code == 200
    result_info = result_res.json()
    assert result_info["score"] == 8.0
    assert len(result_info["answers"]) == 2

    # CSV Export
    csv_res = client.get(f"/api/v1/tests/{test_id}/results/export/csv", headers=auth_headers)
    assert csv_res.status_code == 200
    assert "Aarav Sharma" in csv_res.text
    assert "100" in csv_res.text

    # =========================================================================
    # 9. SECURITY REGRESSIONS CHECK
    # =========================================================================
    # A. Modifying answers after submission must fail (400)
    tamper_res = client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q1_id,
            "selected_option_ids": q1_opt_id,
        },
    )
    assert tamper_res.status_code == 400

    # B. IDOR: Another caller without matching session cannot view results (403)
    foreign_res = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id=foreign_invalid_session_token")
    assert foreign_res.status_code == 403

    # C. Admin endpoints protected against unauthenticated requests (401)
    unauth_res = client.get(f"/api/v1/tests/{test_id}/results/export/csv")
    assert unauth_res.status_code == 401
