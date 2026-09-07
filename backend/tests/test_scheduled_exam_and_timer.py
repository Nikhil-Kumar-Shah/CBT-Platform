import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.user import User
from backend.app.models.test import Test
from backend.app.models.test_attempt import TestAttempt


@pytest.fixture
def scheduled_test_env(client: TestClient, db_session: Session, test_admin: User, auth_headers):
    """Sets up subjects and helper function to create tests with varying schedule and visibility settings."""
    subj = Subject(name="Mathematics Advanced", code="MATH-ADV", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    def _create_test(start_time=None, end_time=None, show_answers=True, show_explanation=True, duration_minutes=30):
        # Create test
        test_resp = client.post(
            "/api/v1/tests",
            json={
                "title": "Scheduled Math Test",
                "subject_id": str(subj.id),
                "duration_minutes": duration_minutes,
                "positive_marks": 4.0,
                "negative_marks": 1.0,
                "result_visibility": "IMMEDIATELY",
                "show_answers": show_answers,
                "show_explanation": show_explanation,
                "allow_resume": True,
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
            },
        )
        assert test_resp.status_code == 201
        test_data = test_resp.json()
        test_id = test_data["id"]
        code = test_data["code"]

        # Add question with options and explanation
        q_resp = client.post(
            f"/api/v1/tests/{test_id}/questions/inline",
            json={
                "question_type": "MCQ",
                "content": "What is the derivative of $\\sin(x)$?",
                "marks": 4.0,
                "negative_marks": 1.0,
                "explanation": "The derivative of $\\sin(x)$ is $\\cos(x)$ by standard calculus rules.",
                "options": [
                    {"option_order": 1, "content": "$\\cos(x)$", "is_correct": True},
                    {"option_order": 2, "content": "$-\\cos(x)$", "is_correct": False},
                    {"option_order": 3, "content": "$\\tan(x)$", "is_correct": False},
                ],
            },
        )
        assert q_resp.status_code == 201

        # Publish
        pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
        assert pub_resp.status_code == 200

        # If start_time was given, publish may set status to SCHEDULED; ensure status is SCHEDULED if start_time in future
        t_model = db_session.get(Test, uuid.UUID(test_id))
        if start_time and start_time > datetime.now(timezone.utc):
            t_model.status = "SCHEDULED"
            db_session.commit()
            db_session.refresh(t_model)

        return {
            "test_id": test_id,
            "code": code,
            "model": t_model,
        }

    return _create_test


def test_early_lobby_access_and_countdown(client: TestClient, scheduled_test_env):
    """1. Early lobby access allows verification anytime before start to power live countdown."""
    now = datetime.now(timezone.utc)

    # 4 minutes before start: returns lobby open and starts_in_seconds
    start_time_in_4m = now + timedelta(minutes=4)
    test_info_4m = scheduled_test_env(start_time=start_time_in_4m)
    resp = client.post("/api/v1/attempts/verify-code", json={"access_code": test_info_4m["code"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_lobby_open"] is True
    assert data["can_start"] is False
    assert 200 <= data["starts_in_seconds"] <= 245
    assert data["server_now"] is not None

    # 10 minutes before start: returns valid countdown state for candidate lobby
    start_time_in_10m = now + timedelta(minutes=10)
    test_info_10m = scheduled_test_env(start_time=start_time_in_10m)
    resp_early = client.post("/api/v1/attempts/verify-code", json={"access_code": test_info_10m["code"]})
    assert resp_early.status_code == 200
    early_data = resp_early.json()
    assert early_data["is_lobby_open"] is True
    assert early_data["can_start"] is False
    assert 550 <= early_data["starts_in_seconds"] <= 610


def test_cannot_start_before_scheduled_start_time(client: TestClient, scheduled_test_env):
    """2. Cannot start examination before scheduled start time even in lobby."""
    now = datetime.now(timezone.utc)
    start_time = now + timedelta(minutes=3)
    test_info = scheduled_test_env(start_time=start_time)

    resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Rohan Verma",
            "candidate_email": "rohan.verma@example.com",
            "candidate_phone": "+91 98765 43210",
        },
    )
    assert resp.status_code == 400
    assert "Your examination hasn't started yet" in resp.json()["detail"]


def test_automatic_transition_at_scheduled_start(client: TestClient, scheduled_test_env, db_session: Session):
    """3. At scheduled start time, verify allows start and attempt start succeeds into LIVE exam."""
    now = datetime.now(timezone.utc)
    # Start time in the past by 2 seconds
    start_time = now - timedelta(seconds=2)
    test_info = scheduled_test_env(start_time=start_time)

    # Verify code indicates lobby is closed, exam can start
    v_resp = client.post("/api/v1/attempts/verify-code", json={"access_code": test_info["code"]})
    assert v_resp.status_code == 200
    v_data = v_resp.json()
    assert v_data["is_lobby_open"] is False
    assert v_data["can_start"] is True
    assert v_data["starts_in_seconds"] == 0

    # Start attempt succeeds
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Priya Patel",
            "candidate_email": "priya.patel@example.com",
            "candidate_phone": "+91 91234 56789",
        },
    )
    assert start_resp.status_code == 201
    start_data = start_resp.json()
    assert start_data["status"] == "IN_PROGRESS"
    assert start_data["candidate_name"] == "Priya Patel"
    assert start_data["candidate_email"] == "priya.patel@example.com"
    assert start_data["candidate_phone"] == "+91 91234 56789"


def test_timer_remains_correct_after_navigation_and_interactions(client: TestClient, scheduled_test_env):
    """4. Clicking options, navigation, review, and saving never resets or corrupts remaining time."""
    test_info = scheduled_test_env(duration_minutes=40)

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Aditya Roy",
            "candidate_email": "aditya.roy@example.com",
            "candidate_phone": "+91 99887 76655",
        },
    )
    assert start_resp.status_code == 201
    start_data = start_resp.json()
    attempt_id = start_data["attempt_id"]
    session_id = start_data["session_id"]
    q_id = start_data["questions"][0]["id"]
    opt_id = start_data["questions"][0]["options"][0]["id"]

    initial_remaining = start_data["time_remaining_seconds"]
    assert 2350 <= initial_remaining <= 2400

    # Save answer interaction
    save_resp = client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "selected_option_ids": opt_id,
            "is_marked_for_review": True,
            "current_question_index": 0,
        },
    )
    assert save_resp.status_code == 200
    save_data = save_resp.json()
    assert save_data["server_now"] is not None
    assert save_data["time_remaining_seconds"] > 2300
    assert save_data["remaining_seconds"] == save_data["time_remaining_seconds"]

    # Toggle review interaction
    rev_resp = client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "is_marked_for_review": False,
        },
    )
    assert rev_resp.status_code == 200
    rev_data = rev_resp.json()
    assert rev_data["time_remaining_seconds"] > 2300

    # State query
    state_resp = client.get(f"/api/v1/attempts/{attempt_id}/state?session_id={session_id}")
    assert state_resp.status_code == 200
    state_data = state_resp.json()
    assert state_data["time_remaining_seconds"] > 2300
    assert state_data["server_now"] is not None


def test_timer_recovery_after_reconciliation_and_backgrounding(client: TestClient, scheduled_test_env):
    """5. Heartbeat & reconciliation return server_now and correct remaining_seconds without NaN."""
    test_info = scheduled_test_env(duration_minutes=25)

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Sanya Malhotra",
            "candidate_email": "sanya.m@example.com",
            "candidate_phone": "+91 97777 88888",
        },
    )
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]

    # Heartbeat reconciliation (as triggered by visibilitychange / focus)
    hb_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/heartbeat",
        json={
            "session_id": session_id,
            "current_question_index": 0,
            "time_spent_delta_seconds": 10,
        },
    )
    assert hb_resp.status_code == 200
    hb_data = hb_resp.json()
    assert hb_data["status"] == "IN_PROGRESS"
    assert hb_data["server_now"] is not None
    assert hb_data["server_time"] is not None
    assert hb_data["time_remaining_seconds"] > 1400
    assert hb_data["remaining_seconds"] == hb_data["time_remaining_seconds"]
    assert hb_data["is_expired"] is False


def test_server_authoritative_expiry_and_auto_submit(client: TestClient, scheduled_test_env, db_session: Session):
    """6. When authoritative deadline passes, attempt is marked EXPIRED and cannot continue."""
    test_info = scheduled_test_env(duration_minutes=15)

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Deepak Chopra",
            "candidate_email": "deepak.c@example.com",
            "candidate_phone": "+91 96666 55555",
        },
    )
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]

    # Force expiry in database
    attempt_model = db_session.get(TestAttempt, uuid.UUID(attempt_id))
    past_time = datetime.now(timezone.utc) - timedelta(seconds=15)
    attempt_model.expires_at = past_time
    db_session.commit()

    # Heartbeat triggers auto-complete/expire
    hb_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/heartbeat",
        json={
            "session_id": session_id,
        },
    )
    assert hb_resp.status_code == 200
    hb_data = hb_resp.json()
    assert hb_data["is_expired"] is True
    assert hb_data["time_remaining_seconds"] == 0

    # Save answer after expiry is forbidden
    q_id = start_resp.json()["questions"][0]["id"]
    save_resp = client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "selected_option_ids": "any",
        },
    )
    assert save_resp.status_code in (400, 403)


def test_show_answers_false_never_exposes_correct_answer(client: TestClient, scheduled_test_env):
    """7. When show_answers is False, API result payload strictly omits correct answers."""
    test_info = scheduled_test_env(show_answers=False, show_explanation=False)

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Ananya Sen",
            "candidate_email": "ananya.sen@example.com",
            "candidate_phone": "+91 95555 44444",
        },
    )
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]
    q_id = start_resp.json()["questions"][0]["id"]
    opt_id = start_resp.json()["questions"][0]["options"][0]["id"]

    # Submit answer
    client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "selected_option_ids": opt_id,
        },
    )

    # Submit attempt
    sub_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert sub_resp.status_code == 200
    sub_data = sub_resp.json()
    assert sub_data.get("answers") is None

    # Get attempt result endpoint
    res_resp = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}")
    assert res_resp.status_code == 200
    res_data = res_resp.json()
    assert res_data.get("answers") is None


def test_show_answers_true_exposes_correct_answer(client: TestClient, scheduled_test_env):
    """8. When show_answers is True, API result payload returns correct answers."""
    test_info = scheduled_test_env(show_answers=True, show_explanation=False)

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Vikram Seth",
            "candidate_email": "vikram.seth@example.com",
            "candidate_phone": "+91 94444 33333",
        },
    )
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]
    q_id = start_resp.json()["questions"][0]["id"]
    opt_id = start_resp.json()["questions"][0]["options"][0]["id"]

    client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "selected_option_ids": opt_id,
        },
    )

    sub_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert sub_resp.status_code == 200
    sub_data = sub_resp.json()
    assert sub_data["answers"][0]["correct_answer"] == "$\\cos(x)$"
    assert sub_data["answers"][0]["explanation"] is None


def test_show_explanation_control(client: TestClient, scheduled_test_env):
    """9. Explanation is only exposed when show_explanation is True."""
    # Test with show_explanation=True
    test_info_exp = scheduled_test_env(show_answers=True, show_explanation=True)
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info_exp["code"],
            "candidate_name": "Neha Dhupia",
            "candidate_email": "neha.d@example.com",
            "candidate_phone": "+91 93333 22222",
        },
    )
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]

    sub_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert sub_resp.status_code == 200
    assert "derivative of $\\sin(x)$ is $\\cos(x)$" in sub_resp.json()["answers"][0]["explanation"]


def test_candidate_data_persistence_and_validation(client: TestClient, scheduled_test_env):
    """10. Candidate Name, Email, and Phone validation and persistence across session calls."""
    test_info = scheduled_test_env()

    # Invalid email rejected
    bad_email = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Karan Johar",
            "candidate_email": "not-an-email",
            "candidate_phone": "+91 98765 43210",
        },
    )
    assert bad_email.status_code == 422

    # Invalid phone rejected
    bad_phone = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Karan Johar",
            "candidate_email": "karan@example.com",
            "candidate_phone": "123",  # fewer than 7 digits
        },
    )
    assert bad_phone.status_code == 422

    # Valid candidate contact info starts and persists
    valid_start = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Karan Johar",
            "candidate_email": "karan.j@example.com",
            "candidate_phone": "+91 98765 43210",
        },
    )
    assert valid_start.status_code == 201
    start_data = valid_start.json()
    attempt_id = start_data["attempt_id"]
    session_id = start_data["session_id"]
    assert start_data["candidate_name"] == "Karan Johar"
    assert start_data["candidate_email"] == "karan.j@example.com"
    assert start_data["candidate_phone"] == "+91 98765 43210"

    # State call preserves candidate email and phone
    state_res = client.get(f"/api/v1/attempts/{attempt_id}/state?session_id={session_id}")
    assert state_res.status_code == 200
    state_data = state_res.json()
    assert state_data["candidate_email"] == "karan.j@example.com"
    assert state_data["candidate_phone"] == "+91 98765 43210"

    # Reconnection / resume preserves candidate email and phone
    resume_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test_info["code"],
            "candidate_name": "Karan Johar",
            "candidate_email": "karan.j@example.com",
            "candidate_phone": "+91 98765 43210",
        },
    )
    assert resume_res.status_code in (200, 201)
    resume_data = resume_res.json()
    assert resume_data["attempt_id"] == attempt_id
    assert resume_data["candidate_email"] == "karan.j@example.com"
    assert resume_data["candidate_phone"] == "+91 98765 43210"

    # Result response preserves candidate email and phone
    sub_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert sub_res.status_code == 200
    res_data = sub_res.json()
    assert res_data["candidate_email"] == "karan.j@example.com"
    assert res_data["candidate_phone"] == "+91 98765 43210"
