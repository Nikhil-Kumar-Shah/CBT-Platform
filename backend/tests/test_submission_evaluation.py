import uuid
import pytest
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
def eval_test_setup(db_session):
    """Create test with diverse question types and marks overrides."""
    user = User(
        username="teacher_eval",
        email="teacher_eval@cbt.local",
        password_hash=hash_password("teacher123"),
        display_name="Evaluation Teacher",
        role="TEACHER",
    )
    db_session.add(user)
    db_session.flush()

    subject = Subject(name="Physics & Math", code="PHY-MATH", status="ACTIVE")
    db_session.add(subject)
    db_session.flush()

    # Q1: MCQ (+4, -1 override)
    q1 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="What is the speed of light in vacuum?",
        marks=4.0,
        negative_marks=1.0,
        difficulty="MEDIUM",
        explanation="Speed of light is approximately 3x10^8 m/s.",
    )
    db_session.add(q1)
    db_session.flush()
    o1_1 = QuestionOption(question_id=q1.id, content="3 x 10^8 m/s", is_correct=True, option_order=1)
    o1_2 = QuestionOption(question_id=q1.id, content="3 x 10^6 m/s", is_correct=False, option_order=2)
    db_session.add_all([o1_1, o1_2])

    # Q2: MSQ / MULTIPLE_CHOICE (+5, -2 override)
    q2 = Question(
        subject_id=subject.id,
        question_type="MULTIPLE_CHOICE",
        content="Which of the following are prime numbers?",
        marks=5.0,
        negative_marks=2.0,
        difficulty="HARD",
        explanation="2 and 3 are prime numbers. 4 is composite.",
    )
    db_session.add(q2)
    db_session.flush()
    o2_1 = QuestionOption(question_id=q2.id, content="2", is_correct=True, option_order=1)
    o2_2 = QuestionOption(question_id=q2.id, content="3", is_correct=True, option_order=2)
    o2_3 = QuestionOption(question_id=q2.id, content="4", is_correct=False, option_order=3)
    db_session.add_all([o2_1, o2_2, o2_3])

    # Q3: TRUE_FALSE (+2, -0.5 override)
    q3 = Question(
        subject_id=subject.id,
        question_type="TRUE_FALSE",
        content="Mass is an intrinsic property of matter.",
        marks=2.0,
        negative_marks=0.5,
        difficulty="EASY",
        explanation="Yes, mass does not change with location.",
    )
    db_session.add(q3)
    db_session.flush()
    o3_1 = QuestionOption(question_id=q3.id, content="True", is_correct=True, option_order=1)
    o3_2 = QuestionOption(question_id=q3.id, content="False", is_correct=False, option_order=2)
    db_session.add_all([o3_1, o3_2])

    # Q4: NUMERICAL (+3, -0 tolerance 0.05)
    q4 = Question(
        subject_id=subject.id,
        question_type="NUMERICAL",
        content="Calculate acceleration due to gravity g on Earth (m/s^2).",
        marks=3.0,
        negative_marks=0.0,
        numerical_answer=9.81,
        numerical_tolerance=0.05,
        difficulty="MEDIUM",
        explanation="Standard gravity is 9.81 m/s^2.",
    )
    db_session.add(q4)
    db_session.flush()

    # Q5: MCQ with test default marks (positive_marks=4, negative_marks=1)
    q5 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="Which planet is known as the Red Planet?",
        marks=4.0,
        negative_marks=1.0,
        difficulty="EASY",
        explanation="Mars appears red due to iron oxide on its surface.",
    )
    db_session.add(q5)
    db_session.flush()
    o5_1 = QuestionOption(question_id=q5.id, content="Mars", is_correct=True, option_order=1)
    o5_2 = QuestionOption(question_id=q5.id, content="Venus", is_correct=False, option_order=2)
    db_session.add_all([o5_1, o5_2])

    test = Test(
        title="Comprehensive Evaluation Test",
        code="EVAL-TEST-01",
        status="LIVE",
        duration_minutes=60,
        positive_marks=4.0,
        negative_marks=1.0,
        result_visibility="IMMEDIATELY",
        show_answers=True,
        show_explanation=True,
        created_by=user.id,
    )
    db_session.add(test)
    db_session.flush()

    # TestQuestions:
    # Q1: override marks 6.0, negative 2.0
    # Q2: override marks 5.0, negative 2.0
    # Q3: override marks 2.0, negative 0.5
    # Q4: override marks 3.0, negative 0.0
    # Q5: no override (uses default 4.0, 1.0)
    # Total marks = 6 + 5 + 2 + 3 + 4 = 20.0
    tq1 = TestQuestion(test_id=test.id, question_id=q1.id, order_index=1, marks=6.0, negative_marks=2.0)
    tq2 = TestQuestion(test_id=test.id, question_id=q2.id, order_index=2, marks=5.0, negative_marks=2.0)
    tq3 = TestQuestion(test_id=test.id, question_id=q3.id, order_index=3, marks=2.0, negative_marks=0.5)
    tq4 = TestQuestion(test_id=test.id, question_id=q4.id, order_index=4, marks=3.0, negative_marks=0.0)
    tq5 = TestQuestion(test_id=test.id, question_id=q5.id, order_index=5, marks=None, negative_marks=None)
    db_session.add_all([tq1, tq2, tq3, tq4, tq5])
    db_session.commit()

    return {
        "user": user,
        "subject": subject,
        "test": test,
        "q1": q1, "o1_1": o1_1, "o1_2": o1_2,
        "q2": q2, "o2_1": o2_1, "o2_2": o2_2, "o2_3": o2_3,
        "q3": q3, "o3_1": o3_1, "o3_2": o3_2,
        "q4": q4,
        "q5": q5, "o5_1": o5_1, "o5_2": o5_2,
    }


def test_question_type_evaluations_and_marks(client, eval_test_setup):
    """Test evaluation of MCQ, MSQ, TRUE_FALSE, NUMERICAL, unattempted questions, and marks overrides."""
    s = eval_test_setup

    # 1. Start candidate attempt
    start = client.post("/api/v1/attempts/start", json={
        "access_code": "EVAL-TEST-01",
        "candidate_name": "Rohan Gupta",
        "roll_number": "RG-201",
    })
    assert start.status_code == status.HTTP_201_CREATED
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]

    # Q1 (MCQ, +6, -2): Answer Correctly -> should get +6
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(s["q1"].id),
        "selected_option_ids": str(s["o1_1"].id),
    })

    # Q2 (MSQ, +5, -2): Answer Partially (only selected option '2', missed option '3') -> should get -2
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(s["q2"].id),
        "selected_option_ids": str(s["o2_1"].id),
    })

    # Q3 (TRUE_FALSE, +2, -0.5): Answer Correctly -> should get +2
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(s["q3"].id),
        "selected_option_ids": str(s["o3_1"].id),
    })

    # Q4 (NUMERICAL, +3, 0): Answer Within Tolerance 9.81 +- 0.05 -> 9.83 -> should get +3
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(s["q4"].id),
        "numerical_answer": 9.83,
    })

    # Q5 (MCQ, +4, -1 default): Leave Unattempted -> should get 0

    # 2. Submit examination
    submit_res = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={
        "session_id": session_id,
    })
    assert submit_res.status_code == status.HTTP_200_OK
    res = submit_res.json()

    # Total Marks = 6 + 5 + 2 + 3 + 4 = 20.0
    assert res["total_marks"] == 20.0
    # Score = +6 (Q1) - 2 (Q2) + 2 (Q3) + 3 (Q4) + 0 (Q5) = 9.0
    assert res["score"] == 9.0
    # Correct = 3 (Q1, Q3, Q4)
    assert res["correct_count"] == 3
    # Incorrect = 1 (Q2)
    assert res["incorrect_count"] == 1
    # Unattempted = 1 (Q5)
    assert res["unattempted_count"] == 1
    # Mathematical consistency: 3 + 1 + 1 == 5
    assert res["correct_count"] + res["incorrect_count"] + res["unattempted_count"] == 5
    # Accuracy = 3 / (3 + 1) = 75.0%
    assert res["accuracy"] == 75.0
    # Percentage = 9.0 / 20.0 * 100 = 45.0%
    assert res["percentage"] == 45.0

    # Question breakdown verified
    assert len(res["answers"]) == 5
    q1_res = next(a for a in res["answers"] if a["question_id"] == str(s["q1"].id))
    assert q1_res["is_correct"] is True
    assert q1_res["marks_awarded"] == 6.0
    assert q1_res["correct_answer"] == "3 x 10^8 m/s"

    q2_res = next(a for a in res["answers"] if a["question_id"] == str(s["q2"].id))
    assert q2_res["is_correct"] is False
    assert q2_res["marks_awarded"] == -2.0

    q5_res = next(a for a in res["answers"] if a["question_id"] == str(s["q5"].id))
    assert q5_res["is_correct"] is None
    assert q5_res["marks_awarded"] == 0.0


def test_submission_idempotency_and_immutability(client, eval_test_setup):
    """Test that repeated submissions return the same result and submitted attempts cannot be modified."""
    s = eval_test_setup

    start = client.post("/api/v1/attempts/start", json={
        "access_code": "EVAL-TEST-01",
        "candidate_name": "Meera Sen",
        "roll_number": "MS-202",
    })
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]

    # Submit
    sub1 = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={"session_id": session_id})
    assert sub1.status_code == status.HTTP_200_OK
    data1 = sub1.json()

    # Submit again (idempotent)
    sub2 = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={"session_id": session_id})
    assert sub2.status_code == status.HTTP_200_OK
    data2 = sub2.json()

    assert data1["score"] == data2["score"]
    assert datetime.fromisoformat(data1["submitted_at"]) == datetime.fromisoformat(data2["submitted_at"])
    assert data1["status"] in ("COMPLETED", "SUBMITTED")

    # Attempt to modify answers on submitted attempt -> must be rejected with 400
    mod = client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(s["q1"].id),
        "selected_option_ids": str(s["o1_1"].id),
    })
    assert mod.status_code == status.HTTP_400_BAD_REQUEST


def test_answer_visibility_and_explanation_security(client, db_session, eval_test_setup):
    """Test that correct answers and explanations are stripped when test settings disable them."""
    s = eval_test_setup

    # 1. Update test settings: hide answers and explanations
    test = db_session.get(Test, s["test"].id)
    test.show_answers = False
    test.show_explanation = False
    db_session.commit()

    start = client.post("/api/v1/attempts/start", json={
        "access_code": "EVAL-TEST-01",
        "candidate_name": "Aakash Varma",
        "roll_number": "AV-203",
    })
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]

    # Answer Q1
    client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
        "session_id": session_id,
        "question_id": str(s["q1"].id),
        "selected_option_ids": str(s["o1_1"].id),
    })

    # Submit
    sub = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={"session_id": session_id})
    assert sub.status_code == status.HTTP_200_OK
    res = sub.json()

    # Scores are shown because result_visibility is IMMEDIATELY
    assert res["show_results"] is True
    # BUT question-by-question review, correct answers, and explanations must NOT be revealed!
    assert res.get("answers") is None
    assert res.get("show_answers") is False
    assert res.get("show_explanation") is False


def test_result_visibility_hidden(client, db_session, eval_test_setup):
    """Test that when result_visibility is HIDDEN, no scores, accuracy, or question results are returned."""
    s = eval_test_setup

    # Update test: result_visibility = HIDDEN
    test = db_session.get(Test, s["test"].id)
    test.result_visibility = "HIDDEN"
    db_session.commit()

    start = client.post("/api/v1/attempts/start", json={
        "access_code": "EVAL-TEST-01",
        "candidate_name": "Deepa Joshi",
        "roll_number": "DJ-204",
    })
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]

    sub = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={"session_id": session_id})
    assert sub.status_code == status.HTTP_200_OK
    res = sub.json()

    assert res["show_results"] is False
    assert res["score"] is None
    assert res["percentage"] is None
    assert res["accuracy"] is None
    assert res["correct_count"] is None
    assert res["answers"] is None


def test_result_authorization_and_in_progress_protection(client, eval_test_setup):
    """Test that unauthorized users or in-progress attempts cannot access the result endpoint."""
    s = eval_test_setup

    start = client.post("/api/v1/attempts/start", json={
        "access_code": "EVAL-TEST-01",
        "candidate_name": "Suresh Patel",
        "roll_number": "SP-205",
    })
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]

    # In-progress attempt -> result endpoint must return 400 Bad Request
    res_in_prog = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}")
    assert res_in_prog.status_code == status.HTTP_400_BAD_REQUEST

    # Submit attempt
    client.post(f"/api/v1/attempts/{attempt_id}/submit", json={"session_id": session_id})

    # Access with invalid session ID -> must return 403 Forbidden
    unauth = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id=fake_session_123")
    assert unauth.status_code == status.HTTP_403_FORBIDDEN

    # Access with valid session ID -> 200 OK
    auth_res = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}")
    assert auth_res.status_code == status.HTTP_200_OK


def test_post_submission_persisted_counts_and_refresh(client, eval_test_setup):
    """Test that submitting via both step-by-step and final_answers payload persists correct counts and persists across reloads."""
    s = eval_test_setup

    start = client.post("/api/v1/attempts/start", json={
        "access_code": "EVAL-TEST-01",
        "candidate_name": "Kavita Rao",
        "roll_number": "KR-206",
    })
    assert start.status_code == status.HTTP_201_CREATED
    attempt_id = start.json()["attempt_id"]
    session_id = start.json()["session_id"]

    # Submit with final_answers payload (simulating Submit & Next / bulk final answers)
    final_payload = [
        {
            "session_id": session_id,
            "question_id": str(s["q1"].id),
            "selected_option_ids": str(s["o1_1"].id), # Correct (+6)
        },
        {
            "session_id": session_id,
            "question_id": str(s["q3"].id),
            "selected_option_ids": str(s["o3_2"].id), # Incorrect (-0.5)
        },
        {
            "session_id": session_id,
            "question_id": str(s["q4"].id),
            "numerical_answer": 9.80, # Correct within tolerance (+3)
        }
        # Q2 and Q5 left unattempted (2 unanswered)
    ]

    submit_res = client.post(f"/api/v1/attempts/{attempt_id}/submit", json={
        "session_id": session_id,
        "final_answers": final_payload,
    })
    assert submit_res.status_code == status.HTTP_200_OK
    data = submit_res.json()

    assert data["total_questions"] == 5
    assert data["answered_count"] == 3
    assert data["unanswered_count"] == 2
    assert data["correct_count"] == 2
    assert data["incorrect_count"] == 1
    assert data["unattempted_count"] == 2
    assert data["score"] == 8.5 # +6 - 0.5 + 3 = 8.5
    assert data["accuracy"] == round(2 / 3 * 100, 2)

    # Reload / refresh result endpoint -> must match exact persisted DB record
    refresh_res = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}")
    assert refresh_res.status_code == status.HTTP_200_OK
    ref_data = refresh_res.json()

    assert ref_data["total_questions"] == 5
    assert ref_data["answered_count"] == 3
    assert ref_data["unanswered_count"] == 2
    assert ref_data["correct_count"] == 2
    assert ref_data["incorrect_count"] == 1
    assert ref_data["unattempted_count"] == 2
    assert ref_data["score"] == 8.5
    assert ref_data["accuracy"] == round(2 / 3 * 100, 2)
    assert ref_data["time_taken_seconds"] >= 0
