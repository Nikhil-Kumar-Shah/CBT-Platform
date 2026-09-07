import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.app.models.subject import Subject
from backend.app.models.user import User


def test_pause_and_resume_attempt_timer_and_lockout(client: TestClient, db_session: Session, test_admin: User, auth_headers):
    uid = uuid.uuid4().hex[:6]
    subj = Subject(name=f"Physics_{uid}", code=f"PHY_{uid}", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()

    # 1. Create a Test with 30 min duration
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "NEET Physics Pause Test",
            "subject_id": str(subj.id),
            "duration_minutes": 30,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
            "result_visibility": "IMMEDIATELY",
            "allow_resume": True,
        },
    )
    assert test_resp.status_code == 201
    test_data = test_resp.json()
    test_id = test_data["id"]
    access_code = test_data["code"]

    # 2. Add Question
    q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the speed of light $c$ in vacuum?",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "$3 \\times 10^8\\text{ m/s}$", "is_correct": True},
                {"option_order": 2, "content": "$3 \\times 10^6\\text{ m/s}$", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201
    q_id = q_resp.json()["questions"][0]["question_id"]
    opt_id = q_resp.json()["questions"][0]["question"]["options"][0]["id"]

    # 3. Publish test
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200

    # 4. Student starts exam
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "code": access_code,
            "candidate_name": "Alice Candidate",
            "candidate_email": f"alice_{uid}@test.edu",
        },
    )
    assert start_resp.status_code in (200, 201)
    session_data = start_resp.json()
    attempt_id = session_data["attempt_id"]
    session_id = session_data["session_id"]
    assert 1790 <= session_data["time_remaining_seconds"] <= 1800

    # 5. Save an answer
    save_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "selected_option_id": opt_id,
        },
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["status"] == "SAVED"

    # 6. Admin pauses the test
    pause_resp = client.post(f"/api/v1/tests/{test_id}/pause")
    assert pause_resp.status_code == 200
    assert pause_resp.json()["status"] == "PAUSED"

    # 7. Student tries to save answer while paused -> 400 Bad Request
    save_blocked = client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "selected_option_id": opt_id,
        },
    )
    assert save_blocked.status_code == 400
    assert "paused" in save_blocked.json()["detail"].lower()

    # 8. Student tries to submit while paused -> 400 Bad Request
    submit_blocked = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_blocked.status_code == 400
    assert "paused" in submit_blocked.json()["detail"].lower()

    # 9. Student heartbeat while paused -> is_paused=True and frozen time remaining
    hb_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/heartbeat",
        json={"session_id": session_id},
    )
    assert hb_resp.status_code == 200
    assert hb_resp.json()["is_paused"] is True
    assert 1780 <= hb_resp.json()["time_remaining_seconds"] <= 1800

    # 10. Admin resumes the test
    resume_resp = client.post(f"/api/v1/tests/{test_id}/resume")
    assert resume_resp.status_code == 200
    assert resume_resp.json()["status"] == "LIVE"

    # 11. Student heartbeat after resume -> is_paused=False and time continues smoothly
    hb_after = client.post(
        f"/api/v1/attempts/{attempt_id}/heartbeat",
        json={"session_id": session_id},
    )
    assert hb_after.status_code == 200
    assert hb_after.json()["is_paused"] is False
    assert 1780 <= hb_after.json()["time_remaining_seconds"] <= 1800

    # 12. Student submits successfully
    submit_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] in ("SUBMITTED", "COMPLETED")
    assert submit_resp.json()["score"] == 4.0
    assert submit_resp.json()["correct_count"] == 1
    assert submit_resp.json()["answered_count"] == 1


@pytest.mark.parametrize("duration", [1, 5, 30, 60, 120])
def test_duration_persistence_and_propagation_to_student(client: TestClient, db_session: Session, test_admin: User, auth_headers, duration: int):
    uid = uuid.uuid4().hex[:6]
    subj = Subject(name=f"Subj_{uid}_{duration}", code=f"S_{uid}_{duration}", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()

    # 1. Create test
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": f"Duration Test {duration}min",
            "subject_id": str(subj.id),
            "duration_minutes": duration,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
        },
    )
    assert test_resp.status_code == 201
    test_id = test_resp.json()["id"]

    # 2. Add question
    q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "Sample statement $\\alpha + \\beta$",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "Opt 1", "is_correct": True},
                {"option_order": 2, "content": "Opt 2", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201

    # 3. Update test duration
    update_resp = client.patch(
        f"/api/v1/tests/{test_id}",
        json={"duration_minutes": duration},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["duration_minutes"] == duration

    # 4. Publish test
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200
    access_code = pub_resp.json()["code"]
    assert pub_resp.json()["duration_minutes"] == duration

    # 5. Student verifies access code
    verify_resp = client.get(f"/api/v1/attempts/verify-access?access_code={access_code}")
    assert verify_resp.status_code == 200
    assert verify_resp.json()["duration_minutes"] == duration

    # 6. Student starts attempt
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "code": access_code,
            "candidate_name": "Test Candidate",
            "candidate_email": f"candidate_{duration}_{uid}@test.edu",
        },
    )
    assert start_resp.status_code in (200, 201)
    session_data = start_resp.json()
    assert session_data["test"]["duration_minutes"] == duration

    expected_seconds = duration * 60
    assert (expected_seconds - 15) <= session_data["time_remaining_seconds"] <= expected_seconds
