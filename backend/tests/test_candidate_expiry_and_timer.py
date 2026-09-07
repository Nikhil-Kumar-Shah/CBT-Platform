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
def expiry_env(client: TestClient, db_session: Session, test_admin: User, auth_headers):
    subj = Subject(name="Chemistry Expiry", code="CHEM-EXP", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    def _create_test(result_visibility="IMMEDIATELY", show_answers=True, show_explanation=True, duration_minutes=15):
        test_resp = client.post(
            "/api/v1/tests",
            json={
                "title": "Chemistry Expiry Test",
                "subject_id": str(subj.id),
                "duration_minutes": duration_minutes,
                "positive_marks": 4.0,
                "negative_marks": 1.0,
                "result_visibility": result_visibility,
                "show_answers": show_answers,
                "show_explanation": show_explanation,
                "allow_resume": True,
            },
        )
        assert test_resp.status_code == 201
        test_data = test_resp.json()
        test_id = test_data["id"]
        code = test_data["code"]

        # Add question 1
        q1_resp = client.post(
            f"/api/v1/tests/{test_id}/questions/inline",
            json={
                "question_type": "MCQ",
                "content": "What is the atomic number of Carbon?",
                "marks": 4.0,
                "negative_marks": 1.0,
                "explanation": "Carbon has 6 protons, so atomic number is 6.",
                "options": [
                    {"option_order": 1, "content": "6", "is_correct": True},
                    {"option_order": 2, "content": "12", "is_correct": False},
                ],
            },
        )
        assert q1_resp.status_code == 201
        q1_id = q1_resp.json()["questions"][0]["question_id"]

        # Add question 2
        q2_resp = client.post(
            f"/api/v1/tests/{test_id}/questions/inline",
            json={
                "question_type": "MCQ",
                "content": "What is the pH of pure water?",
                "marks": 4.0,
                "negative_marks": 1.0,
                "explanation": "Pure water at 25C is neutral with pH 7.",
                "options": [
                    {"option_order": 1, "content": "7", "is_correct": True},
                    {"option_order": 2, "content": "1", "is_correct": False},
                ],
            },
        )
        assert q2_resp.status_code == 201
        q2_id = q2_resp.json()["questions"][1]["question_id"]

        # Publish test
        client.post(f"/api/v1/tests/{test_id}/publish")

        return {
            "test_id": test_id,
            "code": code,
            "q1_id": q1_id,
            "q2_id": q2_id,
        }

    return _create_test


def test_active_writing_expiry_flushes_and_auto_submits(client: TestClient, expiry_env, db_session: Session):
    """Candidate is actively answering when time expires: incoming answer is saved, attempt auto-submitted as EXPIRED."""
    t = expiry_env()
    code = t["code"]
    q1_id = t["q1_id"]

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Daniel Craig", "candidate_email": "daniel@example.com"},
    )
    assert start_resp.status_code == 201
    att_id = start_resp.json()["attempt_id"]
    sess_id = start_resp.json()["session_id"]

    # Candidate answers question 1 before expiry
    q1_opt = start_resp.json()["questions"][0]["options"][0]["id"]
    save1 = client.post(
        f"/api/v1/attempts/{att_id}/answers",
        json={"session_id": sess_id, "question_id": q1_id, "selected_option_ids": q1_opt},
    )
    assert save1.status_code == 200

    # Simulate attempt expiry: set expires_at into the past
    att_model = db_session.get(TestAttempt, uuid.UUID(att_id))
    att_model.expires_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    db_session.commit()

    # Candidate tries to save an answer right as/after timer reaches 0
    save2 = client.post(
        f"/api/v1/attempts/{att_id}/answers",
        json={"session_id": sess_id, "question_id": t["q2_id"], "selected_option_ids": "any"},
    )
    assert save2.status_code == 200
    assert save2.json()["is_expired"] is True

    # Check attempt state in DB
    db_session.refresh(att_model)
    assert att_model.status == "EXPIRED"
    assert att_model.submission_reason == "AUTO_EXPIRED"
    assert att_model.submitted_at is not None
    assert att_model.expired_at is not None

    # Check result screen message
    res_resp = client.get(f"/api/v1/attempts/{att_id}/result?session_id={sess_id}")
    assert res_resp.status_code == 200
    res_data = res_resp.json()
    assert res_data["is_auto_expired"] is True
    assert res_data["submission_reason"] == "AUTO_EXPIRED"
    assert "Time expired. Your examination was automatically submitted." in res_data["message"]
    # Q1 was saved before expiry, so score must reflect it!
    assert res_data["score"] is not None
    assert res_data["score"] > 0


def test_offline_reconnect_sync_auto_finalizes_expired_attempt(client: TestClient, expiry_env, db_session: Session):
    """If browser was offline/sleeping when time expired, the very first server sync auto-finalizes it."""
    t = expiry_env()
    code = t["code"]

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Emma Watson", "candidate_email": "emma@example.com"},
    )
    att_id = start_resp.json()["attempt_id"]
    sess_id = start_resp.json()["session_id"]

    # Fast forward: attempt expires while candidate is away
    att_model = db_session.get(TestAttempt, uuid.UUID(att_id))
    att_model.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.commit()

    # Browser wakes up and calls heartbeat
    hb_resp = client.post(f"/api/v1/attempts/{att_id}/heartbeat", json={"session_id": sess_id})
    assert hb_resp.status_code == 200
    hb_data = hb_resp.json()
    assert hb_data["status"] == "EXPIRED"
    assert hb_data["is_expired"] is True
    assert hb_data["submission_reason"] == "AUTO_EXPIRED"

    # Attempt in DB is finalized
    db_session.refresh(att_model)
    assert att_model.status == "EXPIRED"
    assert att_model.submission_reason == "AUTO_EXPIRED"


def test_refresh_after_expiry(client: TestClient, expiry_env, db_session: Session):
    """Refreshing browser after expiry returns finalized state and never resets timer."""
    t = expiry_env()
    code = t["code"]

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Frank Castle", "candidate_email": "frank@example.com"},
    )
    att_id = start_resp.json()["attempt_id"]
    sess_id = start_resp.json()["session_id"]

    # Expire attempt
    att_model = db_session.get(TestAttempt, uuid.UUID(att_id))
    att_model.expires_at = datetime.now(timezone.utc) - timedelta(seconds=30)
    db_session.commit()

    # Refresh page -> calls GET /attempts/{attempt_id}
    ref_resp = client.get(f"/api/v1/attempts/{att_id}?session_id={sess_id}")
    assert ref_resp.status_code == 200
    ref_data = ref_resp.json()
    assert ref_data["status"] == "EXPIRED"
    assert ref_data["submission_reason"] == "AUTO_EXPIRED"
    assert ref_data["time_remaining_seconds"] == 0

    # Cannot start a new attempt with same code (already submitted/expired)
    retry = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Frank Castle", "candidate_email": "frank@example.com"},
    )
    assert retry.status_code == 400
    assert "already submitted" in retry.json()["detail"].lower()


def test_simultaneous_submit_and_expiry(client: TestClient, expiry_env, db_session: Session):
    """Submit payload received right as expiry occurs flushes final answers and evaluates cleanly."""
    t = expiry_env()
    code = t["code"]
    q1_id = t["q1_id"]

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Grace Hopper", "candidate_email": "grace@example.com"},
    )
    att_id = start_resp.json()["attempt_id"]
    sess_id = start_resp.json()["session_id"]

    opt1_id = start_resp.json()["questions"][0]["options"][0]["id"]

    # Expire attempt
    att_model = db_session.get(TestAttempt, uuid.UUID(att_id))
    att_model.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    # Submit request with forced_by_expiry=True and final_answers
    sub_resp = client.post(
        f"/api/v1/attempts/{att_id}/submit",
        json={
            "session_id": sess_id,
            "forced_by_expiry": True,
            "final_answers": [
                {
                    "session_id": sess_id,
                    "question_id": q1_id,
                    "selected_option_ids": opt1_id,
                }
            ],
        },
    )
    assert sub_resp.status_code == 200
    res_data = sub_resp.json()
    assert res_data["status"] == "EXPIRED"
    assert res_data["is_auto_expired"] is True
    assert res_data["submission_reason"] == "AUTO_EXPIRED"
    assert "Time expired" in res_data["message"]
    # Final answer was evaluated
    assert res_data["correct_count"] == 1


def test_security_hidden_answers_never_leaked_on_expiry(client: TestClient, expiry_env, db_session: Session):
    """When result_visibility=HIDDEN and show_answers=False, auto-expiry must NEVER leak answers or scores."""
    t = expiry_env(result_visibility="HIDDEN", show_answers=False, show_explanation=False)
    code = t["code"]

    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": code, "candidate_name": "Hank Pym", "candidate_email": "hank@example.com"},
    )
    att_id = start_resp.json()["attempt_id"]
    sess_id = start_resp.json()["session_id"]

    # Expire attempt
    att_model = db_session.get(TestAttempt, uuid.UUID(att_id))
    att_model.expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
    db_session.commit()

    # Fetch result after auto-expiry
    client.post(f"/api/v1/attempts/{att_id}/heartbeat", json={"session_id": sess_id})
    res_resp = client.get(f"/api/v1/attempts/{att_id}/result?session_id={sess_id}")
    assert res_resp.status_code == 200
    res = res_resp.json()

    # Must be marked auto-expired
    assert res["status"] == "EXPIRED"
    assert res["is_auto_expired"] is True

    # Detailed scores and answers MUST be None / empty because test is HIDDEN
    assert res["score"] is None
    assert res["percentage"] is None
    assert res["answers"] is None
    assert res["show_results"] is False
    assert "Time expired" in res["message"]
