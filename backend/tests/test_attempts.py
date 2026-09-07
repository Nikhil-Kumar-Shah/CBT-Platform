import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.user import User


@pytest.fixture
def attempt_test_setup(client: TestClient, db_session: Session, test_admin: User, auth_headers):
    # Create Subject
    subj = Subject(name="Physics Standard", code="PHY-STD", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)
    subj_id = str(subj.id)

    # 1. Create a Test
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "NEET Physics Mock Test",
            "subject_id": subj_id,
            "duration_minutes": 45,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
            "result_visibility": "IMMEDIATELY",
            "allow_resume": True,
            "question_order": "FIXED",
            "option_order": "FIXED",
        },
    )
    assert test_resp.status_code == 201
    test_data = test_resp.json()
    test_id = test_data["id"]
    access_code = test_data["code"]

    # 2. Add Questions (1 MCQ, 1 Numerical)
    q1_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the SI unit of Force?",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "Newton", "is_correct": True},
                {"option_order": 2, "content": "Joule", "is_correct": False},
                {"option_order": 3, "content": "Watt", "is_correct": False},
                {"option_order": 4, "content": "Pascal", "is_correct": False},
            ],
        },
    )
    assert q1_resp.status_code == 201

    q2_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "NUMERICAL",
            "content": "Calculate the kinetic energy (in Joules) of a 2kg mass moving at 3 m/s.",
            "marks": 4.0,
            "negative_marks": 0.0,
            "numerical_answer": 9.0,
            "numerical_tolerance": 0.1,
        },
    )
    assert q2_resp.status_code == 201

    # 3. Publish Test to make it LIVE
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200

    return {
        "test_id": test_id,
        "access_code": access_code,
        "subject_id": subj_id,
    }


def test_verify_access_code_flow(client: TestClient, attempt_test_setup):
    access_code = attempt_test_setup["access_code"]

    # 1. Valid code
    resp = client.post("/api/v1/attempts/verify-code", json={"access_code": access_code})
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "NEET Physics Mock Test"
    assert data["total_questions"] == 2
    assert data["total_marks"] == 8.0
    assert data["duration_minutes"] == 45
    assert data["allow_resume"] is True

    # 2. Case insensitivity & trimming
    resp2 = client.post("/api/v1/attempts/verify-code", json={"access_code": f"  {access_code.lower()}  "})
    assert resp2.status_code == 200

    # 3. Invalid code
    resp_bad = client.post("/api/v1/attempts/verify-code", json={"access_code": "NON-EXISTENT-999"})
    assert resp_bad.status_code == 404
    assert "No examination found" in resp_bad.json()["detail"]


def test_start_attempt_zero_trust_security(client: TestClient, attempt_test_setup):
    access_code = attempt_test_setup["access_code"]

    resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Aarav Sharma",
            "roll_number": "ROLL-2026-001",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "IN_PROGRESS"
    assert data["candidate_name"] == "Aarav Sharma"
    assert data["roll_number"] == "ROLL-2026-001"
    assert data["time_remaining_seconds"] > 2600  # 45 mins ~ 2700s
    assert len(data["questions"]) == 2

    # Zero Trust: Check that questions and options do NOT leak answers or is_correct
    for q in data["questions"]:
        assert "is_correct" not in q
        assert "explanation" not in q
        assert "hint" not in q
        assert "numerical_answer" not in q
        for opt in q["options"]:
            assert "is_correct" not in opt
            assert "content" in opt
            assert "id" in opt


def test_single_active_attempt_and_resumption(client: TestClient, attempt_test_setup):
    access_code = attempt_test_setup["access_code"]

    # 1. Start initial attempt
    start1 = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Priya Patel",
            "roll_number": "ROLL-002",
        },
    )
    assert start1.status_code == 201
    attempt1_id = start1.json()["attempt_id"]
    session1_id = start1.json()["session_id"]
    q1_id = start1.json()["questions"][0]["id"]
    opt1_id = start1.json()["questions"][0]["options"][0]["id"]

    # 2. Answer question 1 and mark for review
    ans_resp = client.post(
        f"/api/v1/attempts/{attempt1_id}/answer",
        json={
            "session_id": session1_id,
            "question_id": q1_id,
            "selected_option_ids": opt1_id,
            "is_marked_for_review": True,
            "current_question_index": 0,
        },
    )
    assert ans_resp.status_code == 200
    assert ans_resp.json()["status"] == "SAVED"

    # 3. Simulate page refresh or reconnecting with candidate credentials
    resume_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Priya Patel",
            "roll_number": "ROLL-002",
        },
    )
    assert resume_resp.status_code == 201
    resumed = resume_resp.json()
    assert resumed["attempt_id"] == attempt1_id  # Reused same attempt!
    assert q1_id in resumed["answers"]
    assert resumed["answers"][q1_id]["selected_option_ids"] == opt1_id
    assert q1_id in resumed["marked_for_review"]


def test_scoring_mcq_and_numerical_authoritative(client: TestClient, attempt_test_setup):
    access_code = attempt_test_setup["access_code"]

    start = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Rahul Verma",
            "roll_number": "ROLL-003",
        },
    )
    data = start.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]
    questions = data["questions"]

    # Q1 is MCQ: Newton (option 1) is correct
    q1 = questions[0]
    opt_newton = next(o for o in q1["options"] if o["content"] == "Newton")

    # Q2 is Numerical: correct answer is 9.0
    q2 = questions[1]

    # Save Q1 correct
    client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "selected_option_ids": opt_newton["id"],
        },
    )

    # Save Q2 correct
    client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q2["id"],
            "numerical_answer": 9.05,  # within 0.1 tolerance!
        },
    )

    # Heartbeat
    hb_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/heartbeat",
        json={"session_id": session_id, "current_question_index": 1},
    )
    assert hb_resp.status_code == 200
    assert hb_resp.json()["is_active"] is True

    # Submit
    submit_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_resp.status_code == 200
    res = submit_resp.json()
    assert res["status"] == "COMPLETED"
    assert res["show_results"] is True
    assert res["score"] == 8.0
    assert res["total_marks"] == 8.0
    assert res["percentage"] == 100.0
    assert res["correct_count"] == 2
    assert res["incorrect_count"] == 0
    assert res["unattempted_count"] == 0

    # Retakes should be forbidden
    retake_resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Rahul Verma",
            "roll_number": "ROLL-003",
        },
    )
    assert retake_resp.status_code == 400
    assert "already submitted" in retake_resp.json()["detail"]


def test_negative_marking_and_unattempted(client: TestClient, attempt_test_setup):
    access_code = attempt_test_setup["access_code"]

    start = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Ananya Sen",
            "roll_number": "ROLL-004",
        },
    )
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]
    questions = start.json()["questions"]

    # Q1: select WRONG option (Joule)
    q1 = questions[0]
    opt_joule = next(o for o in q1["options"] if o["content"] == "Joule")

    client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "selected_option_ids": opt_joule["id"],
        },
    )

    # Q2: Leave unattempted

    # Submit
    submit_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_resp.status_code == 200
    res = submit_resp.json()
    assert res["score"] == -1.0  # -1 for wrong Q1, 0 for unattempted Q2
    assert res["correct_count"] == 0
    assert res["incorrect_count"] == 1
    assert res["unattempted_count"] == 1
