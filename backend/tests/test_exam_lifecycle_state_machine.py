import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.user import User
from backend.app.models.test import Test
from backend.app.models.test_attempt import TestAttempt
from backend.app.models.question import Question


@pytest.fixture
def lifecycle_env(client: TestClient, db_session: Session, test_admin: User, auth_headers):
    subj = Subject(name="Physics Lifecycle", code="PHYS-LC", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    def _create_test(start_time=None, end_time=None, duration_minutes=30):
        test_resp = client.post(
            "/api/v1/tests",
            json={
                "title": "Exam Lifecycle Test",
                "subject_id": str(subj.id),
                "duration_minutes": duration_minutes,
                "positive_marks": 4.0,
                "negative_marks": 1.0,
                "result_visibility": "IMMEDIATELY",
                "show_answers": True,
                "show_explanation": True,
                "allow_resume": True,
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
            },
        )
        assert test_resp.status_code == 201
        test_data = test_resp.json()
        test_id = test_data["id"]
        code = test_data["code"]

        # Add a question
        q_resp = client.post(
            f"/api/v1/tests/{test_id}/questions/inline",
            json={
                "question_type": "MCQ",
                "content": "What is the speed of light?",
                "marks": 4.0,
                "negative_marks": 1.0,
                "explanation": "c ≈ 3x10^8 m/s",
                "options": [
                    {"option_order": 1, "content": "3x10^8 m/s", "is_correct": True},
                    {"option_order": 2, "content": "3x10^6 m/s", "is_correct": False},
                ],
            },
        )
        assert q_resp.status_code == 201
        q_data = q_resp.json()
        q_id = q_data["questions"][0]["question_id"]

        t_model = db_session.get(Test, uuid.UUID(test_id))
        return {
            "test_id": test_id,
            "code": code,
            "model": t_model,
            "question_id": q_id,
        }

    return _create_test


def test_standard_lifecycle_draft_to_scheduled_to_live_to_completed(client: TestClient, auth_headers, lifecycle_env, db_session: Session):
    """Lifecycle: DRAFT -> SCHEDULED -> LIVE -> COMPLETED."""
    now = datetime.now(timezone.utc)
    future_start = now + timedelta(hours=2)
    future_end = now + timedelta(hours=4)

    test = lifecycle_env(start_time=future_start, end_time=future_end)
    t_id = test["test_id"]

    # Initial state is DRAFT
    get_res = client.get(f"/api/v1/tests/{t_id}")
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "DRAFT"

    # 1. Publish test with future start_time -> becomes SCHEDULED
    pub_res = client.post(f"/api/v1/tests/{t_id}/publish")
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "SCHEDULED"

    # 2. Transition SCHEDULED -> LIVE (start time arrives)
    model = db_session.get(Test, uuid.UUID(t_id))
    model.start_time = now - timedelta(minutes=5)
    db_session.commit()

    # When start_time has arrived, start endpoint or publish moves to LIVE
    live_res = client.post(f"/api/v1/tests/{t_id}/publish")
    assert live_res.status_code == 200
    assert live_res.json()["status"] == "LIVE"

    # 3. Conclude test -> COMPLETED
    conclude_res = client.post(f"/api/v1/tests/{t_id}/conclude")
    assert conclude_res.status_code == 200
    assert conclude_res.json()["status"] == "COMPLETED"


def test_reschedule_workflow(client: TestClient, auth_headers, lifecycle_env, db_session: Session):
    """Lifecycle: SCHEDULED -> RESCHEDULED -> LIVE."""
    now = datetime.now(timezone.utc)
    t = lifecycle_env(start_time=now + timedelta(hours=1), end_time=now + timedelta(hours=2))
    t_id = t["test_id"]

    client.post(f"/api/v1/tests/{t_id}/publish")
    assert client.get(f"/api/v1/tests/{t_id}").json()["status"] == "SCHEDULED"

    # Reschedule to a new future time
    new_start = now + timedelta(days=1)
    new_end = now + timedelta(days=1, hours=2)
    resched_res = client.post(
        f"/api/v1/tests/{t_id}/reschedule",
        json={"start_time": new_start.isoformat(), "end_time": new_end.isoformat()},
    )
    assert resched_res.status_code == 200
    resched_data = resched_res.json()
    assert resched_data["status"] == "SCHEDULED"
    assert "start_time" in resched_data

    # Error checking: cannot reschedule to past time
    past_start = now - timedelta(hours=1)
    bad_res = client.post(
        f"/api/v1/tests/{t_id}/reschedule",
        json={"start_time": past_start.isoformat(), "end_time": new_end.isoformat()},
    )
    assert bad_res.status_code == 400
    assert "future" in bad_res.json()["detail"].lower()


def test_unschedule_to_draft_and_guards(client: TestClient, auth_headers, lifecycle_env, db_session: Session):
    """SCHEDULED -> DRAFT (unschedule), and ensure it's blocked once candidate attempts exist."""
    now = datetime.now(timezone.utc)
    t = lifecycle_env(start_time=now + timedelta(hours=1), end_time=now + timedelta(hours=2))
    t_id = t["test_id"]

    client.post(f"/api/v1/tests/{t_id}/publish")
    assert client.get(f"/api/v1/tests/{t_id}").json()["status"] == "SCHEDULED"

    # Unschedule to DRAFT
    unsched_res = client.post(f"/api/v1/tests/{t_id}/unschedule")
    assert unsched_res.status_code == 200
    assert unsched_res.json()["status"] == "DRAFT"

    # Re-publish to SCHEDULED
    client.post(f"/api/v1/tests/{t_id}/publish")

    # Simulate an attempt exists
    fake_attempt = TestAttempt(
        test_id=uuid.UUID(t_id),
        student_name="Test Student",
        candidate_email="student@example.com",
        status="IN_PROGRESS",
        started_at=now,
        expires_at=now + timedelta(minutes=30),
        session_id="sess_123",
    )
    db_session.add(fake_attempt)
    db_session.commit()

    # Attempting to unschedule now must fail
    blocked_res = client.post(f"/api/v1/tests/{t_id}/unschedule")
    assert blocked_res.status_code == 400
    assert "candidate attempts" in blocked_res.json()["detail"].lower()


def test_pause_and_resume_workflow_with_timer_extension(client: TestClient, auth_headers, lifecycle_env, db_session: Session):
    """LIVE -> PAUSED -> LIVE. Candidates cannot answer while paused; resuming credits pause duration."""
    t = lifecycle_env(duration_minutes=30)
    t_id = t["test_id"]
    code = t["code"]

    # Publish to LIVE
    client.post(f"/api/v1/tests/{t_id}/publish")
    assert client.get(f"/api/v1/tests/{t_id}").json()["status"] == "LIVE"

    # Candidate starts attempt
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Alice Wonderland", "candidate_email": "alice@example.com"},
    )
    assert start_resp.status_code == 201
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]
    initial_expires_at = datetime.fromisoformat(start_resp.json()["expires_at"].replace("Z", "+00:00"))

    # Admin pauses exam
    pause_res = client.post(f"/api/v1/tests/{t_id}/pause")
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "PAUSED"

    # Heartbeat during pause returns is_paused=True
    hb = client.post(f"/api/v1/attempts/{attempt_id}/heartbeat", json={"session_id": session_id})
    assert hb.status_code == 200
    assert hb.json()["is_paused"] is True

    # Candidate attempting to save answer while paused is rejected
    save_res = client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": t["question_id"],
            "selected_option_ids": "any",
        },
    )
    assert save_res.status_code == 400
    assert "paused" in save_res.json()["detail"].lower()

    # Fast forward: simulate paused 10 minutes ago
    t_model = db_session.get(Test, uuid.UUID(t_id))
    t_model.paused_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db_session.commit()

    # Admin resumes exam
    resume_res = client.post(f"/api/v1/tests/{t_id}/resume")
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "LIVE"

    # Check candidate attempt expires_at was extended by ~10 minutes
    att_model = db_session.get(TestAttempt, uuid.UUID(attempt_id))
    diff_extension = (att_model.expires_at - initial_expires_at).total_seconds()
    assert 580 <= diff_extension <= 620  # ~600 seconds extended!


def test_cancellation_workflow(client: TestClient, auth_headers, lifecycle_env, db_session: Session):
    """SCHEDULED/LIVE -> CANCELLED: active attempts cancelled, historical preserved, cancellation logged."""
    t = lifecycle_env(duration_minutes=30)
    t_id = t["test_id"]
    code = t["code"]

    client.post(f"/api/v1/tests/{t_id}/publish")

    # Start an attempt
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Bob Builder", "candidate_email": "bob@example.com"},
    )
    assert start_resp.status_code == 201
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]

    # Cancel exam with reason
    cancel_res = client.post(
        f"/api/v1/tests/{t_id}/cancel",
        json={"reason": "Server maintenance emergency"},
    )
    assert cancel_res.status_code == 200
    cdata = cancel_res.json()
    assert cdata["status"] == "CANCELLED"
    assert cdata["cancel_reason"] == "Server maintenance emergency"
    assert cdata["cancelled_at"] is not None

    # Verify attempt in DB was transitioned to CANCELLED
    att_model = db_session.get(TestAttempt, uuid.UUID(attempt_id))
    assert att_model.status == "CANCELLED"
    assert att_model.submission_reason == "CANCELLED"

    # New candidate cannot enter cancelled exam
    verify_res = client.post("/api/v1/attempts/verify-code", json={"access_code": code})
    assert verify_res.status_code == 400
    assert "cancelled" in verify_res.json()["detail"].lower()


def test_invalid_state_transitions_disallowed(client: TestClient, auth_headers, lifecycle_env):
    """Define and enforce valid transitions; reject unsafe transitions."""
    t = lifecycle_env(duration_minutes=30)
    t_id = t["test_id"]

    # Publish to LIVE, then complete
    client.post(f"/api/v1/tests/{t_id}/publish")
    client.post(f"/api/v1/tests/{t_id}/conclude")
    assert client.get(f"/api/v1/tests/{t_id}").json()["status"] == "COMPLETED"

    # COMPLETED -> LIVE or DRAFT must fail
    res = client.patch(f"/api/v1/tests/{t_id}", json={"status": "LIVE"})
    assert res.status_code == 400
    assert "transition" in res.json()["detail"].lower() or "completed" in res.json()["detail"].lower()

    res2 = client.patch(f"/api/v1/tests/{t_id}", json={"status": "DRAFT"})
    assert res2.status_code == 400


def test_completed_exam_duplication_workflow(client: TestClient, auth_headers, lifecycle_env):
    """Completed exam duplicate/recreate as new exam preserves original and creates fresh DRAFT."""
    t = lifecycle_env(duration_minutes=30)
    t_id = t["test_id"]

    client.post(f"/api/v1/tests/{t_id}/publish")
    client.post(f"/api/v1/tests/{t_id}/conclude")

    dup_res = client.post(f"/api/v1/tests/{t_id}/duplicate")
    assert dup_res.status_code in (200, 201)
    dup_data = dup_res.json()
    assert dup_data["id"] != t_id
    assert dup_data["status"] == "DRAFT"
    assert dup_data["code"] != t["code"]
    assert dup_data["start_time"] is None
    assert dup_data["end_time"] is None
    assert dup_data["attempts_count"] == 0

    # Original remains COMPLETED
    orig_res = client.get(f"/api/v1/tests/{t_id}")
    assert orig_res.json()["status"] == "COMPLETED"


def test_structural_modification_lock_with_attempts(client: TestClient, auth_headers, lifecycle_env, db_session: Session):
    """Cannot add, delete, reorder, or alter question structure once attempts exist."""
    t = lifecycle_env(duration_minutes=30)
    t_id = t["test_id"]
    code = t["code"]
    q_id = t["question_id"]

    client.post(f"/api/v1/tests/{t_id}/publish")

    # Start an attempt
    st_res = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Charlie", "candidate_email": "charlie@example.com"},
    )
    assert st_res.status_code == 201

    # 1. Try to delete question
    del_res = client.delete(f"/api/v1/tests/{t_id}/questions/{q_id}")
    assert del_res.status_code == 400
    assert "cannot delete" in del_res.json()["detail"].lower() or "structurally modify" in del_res.json()["detail"].lower() or "candidate attempts" in del_res.json()["detail"].lower() or "live" in del_res.json()["detail"].lower()

    # 2. Try to change question type or marks
    mod_res = client.put(
        f"/api/v1/tests/{t_id}/questions/{q_id}",
        json={
            "question_type": "NUMERICAL",
            "content": "Changed type",
            "marks": 10.0,
            "negative_marks": 0.0,
        },
    )
    assert mod_res.status_code == 400
    assert "cannot change question type" in mod_res.json()["detail"].lower() or "scoring" in mod_res.json()["detail"].lower()
