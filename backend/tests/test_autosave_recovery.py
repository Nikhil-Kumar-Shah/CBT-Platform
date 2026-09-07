import pytest
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import status

from backend.app.models.user import User
from backend.app.models.subject import Subject
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.test import Test
from backend.app.models.test_question import TestQuestion
from backend.app.models.test_attempt import TestAttempt, TestAttemptAnswer
from backend.app.core.security import hash_password


@pytest.fixture
def autosave_test_setup(db_session):
    """Create test with questions for autosave hardening tests."""
    user = User(
        username="teacher_autosave",
        email="teacher_autosave@cbt.local",
        password_hash=hash_password("teacher123"),
        display_name="Autosave Teacher",
        role="TEACHER",
    )
    db_session.add(user)
    db_session.flush()

    subject = Subject(name="Computer Science", code="CS-RECOV", status="ACTIVE")
    db_session.add(subject)
    db_session.flush()

    # Question 1: MCQ
    q1 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="What does ACID stand for in databases?",
        marks=4.0,
        negative_marks=1.0,
        created_by=user.id,
    )
    db_session.add(q1)
    db_session.flush()

    o1 = QuestionOption(question_id=q1.id, content="Atomicity, Consistency, Isolation, Durability", is_correct=True, option_order=1)
    o2 = QuestionOption(question_id=q1.id, content="Access, Control, Index, Data", is_correct=False, option_order=2)
    db_session.add_all([o1, o2])

    # Question 2: Numerical
    q2 = Question(
        subject_id=subject.id,
        question_type="NUMERICAL",
        content="What is 2^8?",
        marks=4.0,
        negative_marks=0.0,
        numerical_answer=256.0,
        numerical_tolerance=0.0,
        created_by=user.id,
    )
    db_session.add(q2)
    db_session.flush()

    # Test
    now = datetime.now(timezone.utc)
    test = Test(
        title="Autosave & Recovery Hardening Test",
        code="CS-AUTOSAVE",
        duration_minutes=30,
        status="LIVE",
        positive_marks=4.0,
        negative_marks=1.0,
        allow_resume=True,
        result_visibility="IMMEDIATELY",
        created_by=user.id,
    )
    db_session.add(test)
    db_session.flush()

    tq1 = TestQuestion(test_id=test.id, question_id=q1.id, order_index=1, marks=4.0, negative_marks=1.0)
    tq2 = TestQuestion(test_id=test.id, question_id=q2.id, order_index=2, marks=4.0, negative_marks=0.0)
    db_session.add_all([tq1, tq2])
    db_session.commit()

    return {
        "test": test,
        "q1": q1,
        "q2": q2,
        "o1": o1,
        "o2": o2,
    }


def test_response_upsert_and_idempotency(client, db_session, autosave_test_setup):
    """Test that multiple saves to the same question update the row rather than creating duplicates."""
    setup = autosave_test_setup
    
    # 1. Start attempt
    start_res = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Rohan Gupta",
        "roll_number": "CS-101",
    })
    assert start_res.status_code == status.HTTP_201_CREATED
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]
    q1_id = str(setup["q1"].id)
    o1_id = str(setup["o1"].id)
    o2_id = str(setup["o2"].id)

    # 2. Save Option 1
    save1 = client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": q1_id,
        "selected_option_ids": o1_id,
        "is_marked_for_review": False,
    })
    assert save1.status_code == status.HTTP_200_OK

    # 3. Save again with Option 2 (simulating user changing their mind or retrying)
    save2 = client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": q1_id,
        "selected_option_ids": o2_id,
        "is_marked_for_review": True,
    })
    assert save2.status_code == status.HTTP_200_OK

    # 4. Verify in DB there is exactly 1 row for this attempt and question
    rows = db_session.query(TestAttemptAnswer).filter_by(
        attempt_id=uuid.UUID(attempt_id),
        question_id=uuid.UUID(q1_id)
    ).all()
    assert len(rows) == 1
    assert rows[0].selected_option_ids == o2_id
    assert rows[0].is_marked_for_review is True


def test_stale_response_protection(client, db_session, autosave_test_setup):
    """Test that a delayed/stale response packet does not overwrite a newer saved response."""
    setup = autosave_test_setup

    start_res = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Sanya Malhotra",
        "roll_number": "CS-102",
    })
    attempt_id = start_res.json()["attempt_id"]
    session_id = start_res.json()["session_id"]
    q1_id = str(setup["q1"].id)
    o1_id = str(setup["o1"].id)
    o2_id = str(setup["o2"].id)

    # Save at T2 (newer)
    t2 = datetime(2026, 9, 6, 12, 0, 10, tzinfo=timezone.utc)
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": q1_id,
        "selected_option_ids": o1_id,
        "client_timestamp": t2.isoformat(),
    })

    # Delayed arrival from T1 (older by 5 seconds)
    t1 = datetime(2026, 9, 6, 12, 0, 5, tzinfo=timezone.utc)
    stale_res = client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": q1_id,
        "selected_option_ids": o2_id,
        "client_timestamp": t1.isoformat(),
    })
    assert stale_res.status_code == status.HTTP_200_OK

    # Verify DB still has o1_id, not stale o2_id
    ans_db = db_session.query(TestAttemptAnswer).filter_by(
        attempt_id=uuid.UUID(attempt_id),
        question_id=uuid.UUID(q1_id)
    ).first()
    assert ans_db.selected_option_ids == o1_id


def test_submitted_attempt_immutability(client, db_session, autosave_test_setup):
    """Test that once submitted, an attempt is immutable and rejects further saves."""
    setup = autosave_test_setup

    start_res = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Tarun Verma",
        "roll_number": "CS-103",
    })
    attempt_id = start_res.json()["attempt_id"]
    session_id = start_res.json()["session_id"]

    # Submit attempt
    sub_res = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={
        "session_id": session_id,
    })
    assert sub_res.status_code == status.HTTP_200_OK
    assert sub_res.json()["status"] == "COMPLETED"

    # Attempt to save after submission
    late_save = client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(setup["q1"].id),
        "selected_option_ids": str(setup["o1"].id),
    })
    assert late_save.status_code == status.HTTP_400_BAD_REQUEST
    assert "Cannot save answer" in late_save.json()["detail"]


def test_submission_idempotency(client, db_session, autosave_test_setup):
    """Test that repeated submit requests return the same result safely without creating duplicates."""
    start_res = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Vikram Seth",
        "roll_number": "CS-104",
    })
    attempt_id = start_res.json()["attempt_id"]
    session_id = start_res.json()["session_id"]

    # First Submit
    sub1 = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={
        "session_id": session_id,
    })
    assert sub1.status_code == status.HTTP_200_OK

    # Repeated Submit (e.g. double click or network retry)
    sub2 = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={
        "session_id": session_id,
    })
    assert sub2.status_code == status.HTTP_200_OK
    assert sub2.json()["attempt_id"] == attempt_id
    assert sub2.json()["status"] == "COMPLETED"


def test_submit_flushes_final_answers(client, db_session, autosave_test_setup):
    """Test that calling submit with final_answers array persists unsaved responses prior to evaluation."""
    setup = autosave_test_setup

    start_res = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Ananya Roy",
        "roll_number": "CS-105",
    })
    attempt_id = start_res.json()["attempt_id"]
    session_id = start_res.json()["session_id"]
    q1_id = str(setup["q1"].id)
    o1_id = str(setup["o1"].id)

    # Submit directly with final_answers (simulating queued answers flushed on submit)
    sub = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={
        "session_id": session_id,
        "final_answers": [
            {
                "session_id": session_id,
                "question_id": q1_id,
                "selected_option_ids": o1_id,
                "is_marked_for_review": False,
            }
        ]
    })
    assert sub.status_code == status.HTTP_200_OK
    res_data = sub.json()
    assert res_data["correct_count"] == 1
    assert res_data["score"] == 4.0


def test_resume_flow_preserves_state(client, db_session, autosave_test_setup):
    """Test that restarting an existing attempt returns the active attempt with identical question order and answers."""
    setup = autosave_test_setup

    # 1. First start
    start1 = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Kavita Rao",
        "roll_number": "CS-106",
    })
    attempt_id = start1.json()["attempt_id"]
    session_id = start1.json()["session_id"]
    q_order1 = [q["id"] for q in start1.json()["questions"]]

    # 2. Answer question 1 and mark for review
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(setup["q1"].id),
        "selected_option_ids": str(setup["o1"].id),
        "is_marked_for_review": True,
        "current_question_index": 1,
    })

    # 3. Simulate browser tab closed and reopening -> candidate re-enters access code
    resume = client.post("/api/v1/attempts/start", json={
        "access_code": "CS-AUTOSAVE",
        "candidate_name": "Kavita Rao",
        "roll_number": "CS-106",
    })
    assert resume.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
    res_data = resume.json()
    assert res_data["attempt_id"] == attempt_id
    # Question order preserved
    assert [q["id"] for q in res_data["questions"]] == q_order1
    # Answers preserved
    ans = res_data["answers"][str(setup["q1"].id)]
    assert ans["selected_option_ids"] == str(setup["o1"].id)
    assert ans["is_marked_for_review"] is True
