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
from backend.app.models.test_attempt import TestAttempt
from backend.app.core.security import hash_password


@pytest.fixture
def exam_submission_fixture(db_session):
    """Setup test and questions for submission verification."""
    user = User(
        username="teacher_sub_test",
        email="teacher_sub_test@cbt.local",
        password_hash=hash_password("teacher123"),
        display_name="Sub Test Teacher",
        role="TEACHER",
    )
    db_session.add(user)
    db_session.flush()

    subject = Subject(name="Mathematics", code="MATH-SUB", status="ACTIVE")
    db_session.add(subject)
    db_session.flush()

    # Single-question test (Test A)
    test_single = Test(
        title="Single Question Exam",
        code="SINGLE101",
        description="Test with only 1 question",
        instructions="Complete the exam.",
        subject_id=subject.id,
        created_by=user.id,
        duration_minutes=30,
        positive_marks=4.0,
        negative_marks=1.0,
        status="PUBLISHED",
        result_visibility="IMMEDIATELY",
    )
    db_session.add(test_single)
    db_session.flush()

    q1 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="What is 2 + 2?",
        marks=4.0,
        negative_marks=1.0,
        difficulty="EASY",
    )
    db_session.add(q1)
    db_session.flush()

    o1_correct = QuestionOption(question_id=q1.id, content="4", is_correct=True, option_order=1)
    o1_wrong = QuestionOption(question_id=q1.id, content="5", is_correct=False, option_order=2)
    db_session.add_all([o1_correct, o1_wrong])
    db_session.flush()

    tq1 = TestQuestion(test_id=test_single.id, question_id=q1.id, order_index=0, marks=4.0, negative_marks=1.0)
    db_session.add(tq1)

    # Multi-question test (Test B)
    test_multi = Test(
        title="Two Question Exam",
        code="MULTI102",
        description="Test with 2 questions",
        instructions="Complete both questions.",
        subject_id=subject.id,
        created_by=user.id,
        duration_minutes=30,
        positive_marks=4.0,
        negative_marks=1.0,
        status="PUBLISHED",
        result_visibility="IMMEDIATELY",
    )
    db_session.add(test_multi)
    db_session.flush()

    q2 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="What is 3 * 3?",
        marks=4.0,
        negative_marks=1.0,
        difficulty="EASY",
    )
    db_session.add(q2)
    db_session.flush()

    o2_correct = QuestionOption(question_id=q2.id, content="9", is_correct=True, option_order=1)
    o2_wrong = QuestionOption(question_id=q2.id, content="6", is_correct=False, option_order=2)
    db_session.add_all([o2_correct, o2_wrong])
    db_session.flush()

    tq_m1 = TestQuestion(test_id=test_multi.id, question_id=q1.id, order_index=0, marks=4.0, negative_marks=1.0)
    tq_m2 = TestQuestion(test_id=test_multi.id, question_id=q2.id, order_index=1, marks=4.0, negative_marks=1.0)
    db_session.add_all([tq_m1, tq_m2])
    db_session.commit()

    return {
        "test_single": test_single,
        "test_multi": test_multi,
        "q1": q1,
        "q2": q2,
        "o1_correct": o1_correct,
        "o1_wrong": o1_wrong,
        "o2_correct": o2_correct,
        "o2_wrong": o2_wrong,
    }


def test_single_question_selected_correct_answer_persists_and_scores(client, exam_submission_fixture):
    """
    ROOT CAUSE BUG REGRESSION TEST:
    When candidate selects the correct option on a 1-question exam and submits,
    the score must be +4, Answered: 1, Unanswered: 0, Correct: 1.
    """
    fixture = exam_submission_fixture
    test = fixture["test_single"]
    q1 = fixture["q1"]
    o1_correct = fixture["o1_correct"]

    # 1. Start attempt
    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test.code,
            "candidate_name": "Alice Candidate",
            "candidate_email": "alice@example.com",
        },
    )
    assert start_res.status_code == status.HTTP_201_CREATED
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]

    # 2. Save answer using selected_option_id (singular, like frontend sends)
    save_res = client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": str(q1.id),
            "selected_option_id": str(o1_correct.id),
        },
    )
    assert save_res.status_code == status.HTTP_200_OK

    # 3. Submit exam with final_answers containing selected_option_id
    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={
            "session_id": session_id,
            "final_answers": [
                {
                    "session_id": session_id,
                    "question_id": str(q1.id),
                    "selected_option_id": str(o1_correct.id),
                    "selected_option_ids": str(o1_correct.id),
                }
            ],
        },
    )
    assert submit_res.status_code == status.HTTP_200_OK
    result = submit_res.json()

    # Verify score & breakdown: NOT 0!
    assert result["score"] == 4.0
    assert result["correct_count"] == 1
    assert result["incorrect_count"] == 0
    assert result["unattempted_count"] == 0
    assert result["accuracy"] == 100.0
    assert result["status"] == "COMPLETED"


def test_single_question_selected_incorrect_answer_persists_and_deducts(client, exam_submission_fixture):
    """
    When candidate selects an incorrect option on a 1-question exam and submits,
    score is deducted by negative marks (-1), Answered: 1, Unanswered: 0, Incorrect: 1.
    """
    fixture = exam_submission_fixture
    test = fixture["test_single"]
    q1 = fixture["q1"]
    o1_wrong = fixture["o1_wrong"]

    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test.code,
            "candidate_name": "Bob Candidate",
        },
    )
    assert start_res.status_code == status.HTTP_201_CREATED
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]

    # Submit directly with wrong answer
    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={
            "session_id": session_id,
            "final_answers": [
                {
                    "session_id": session_id,
                    "question_id": str(q1.id),
                    "selected_option_id": str(o1_wrong.id),
                }
            ],
        },
    )
    assert submit_res.status_code == status.HTTP_200_OK
    result = submit_res.json()

    assert result["score"] == -1.0
    assert result["correct_count"] == 0
    assert result["incorrect_count"] == 1
    assert result["unattempted_count"] == 0
    assert result["accuracy"] == 0.0


def test_single_question_unanswered_submission(client, exam_submission_fixture):
    """
    When candidate selects no option and submits,
    Score is 0, Answered: 0, Unanswered: 1.
    """
    fixture = exam_submission_fixture
    test = fixture["test_single"]
    q1 = fixture["q1"]

    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test.code,
            "candidate_name": "Charlie Candidate",
        },
    )
    assert start_res.status_code == status.HTTP_201_CREATED
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]

    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={
            "session_id": session_id,
            "final_answers": [
                {
                    "session_id": session_id,
                    "question_id": str(q1.id),
                    "selected_option_id": None,
                    "selected_option_ids": None,
                }
            ],
        },
    )
    assert submit_res.status_code == status.HTTP_200_OK
    result = submit_res.json()

    assert result["score"] == 0.0
    assert result["correct_count"] == 0
    assert result["incorrect_count"] == 0
    assert result["unattempted_count"] == 1


def test_last_question_submitted_directly_in_final_answers_race_condition(client, exam_submission_fixture):
    """
    Simulates candidate on the last question clicking an option and hitting submit immediately,
    where save_answer HTTP request had not finished or was bypassed.
    final_answers must persist both answers accurately.
    """
    fixture = exam_submission_fixture
    test = fixture["test_multi"]
    q1 = fixture["q1"]
    q2 = fixture["q2"]
    o1_correct = fixture["o1_correct"]
    o2_correct = fixture["o2_correct"]

    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": test.code,
            "candidate_name": "Dana Candidate",
        },
    )
    assert start_res.status_code == status.HTTP_201_CREATED
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]

    # Q1 was saved earlier
    client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": str(q1.id),
            "selected_option_id": str(o1_correct.id),
        },
    )

    # Q2 is selected on screen immediately before Submit, passed in final_answers
    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={
            "session_id": session_id,
            "final_answers": [
                {
                    "session_id": session_id,
                    "question_id": str(q1.id),
                    "selected_option_id": str(o1_correct.id),
                },
                {
                    "session_id": session_id,
                    "question_id": str(q2.id),
                    "selected_option_id": str(o2_correct.id),
                },
            ],
        },
    )
    assert submit_res.status_code == status.HTTP_200_OK
    result = submit_res.json()

    assert result["score"] == 8.0  # 4 + 4
    assert result["correct_count"] == 2
    assert result["incorrect_count"] == 0
    assert result["unattempted_count"] == 0
    assert result["accuracy"] == 100.0


def test_schema_harmonization_singular_and_plural_keys(client, exam_submission_fixture):
    """
    Verify backend schema transparently accepts selected_option_id, selected_option_ids, or both.
    """
    fixture = exam_submission_fixture
    test = fixture["test_single"]
    q1 = fixture["q1"]
    o1_correct = fixture["o1_correct"]

    start_res = client.post(
        "/api/v1/attempts/start",
        json={"access_code": test.code, "candidate_name": "Evan Candidate"},
    )
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]

    # Save with singular key
    save_res1 = client.put(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": str(q1.id),
            "selected_option_id": str(o1_correct.id),
        },
    )
    assert save_res1.status_code == status.HTTP_200_OK

    # Fetch attempt state to verify answer is populated
    state_res = client.get(f"/api/v1/attempts/{attempt_id}/state?session_id={session_id}")
    assert state_res.status_code == status.HTTP_200_OK
    state_data = state_res.json()
    q1_ans = state_data["answers"].get(str(q1.id))
    assert q1_ans is not None
    assert q1_ans.get("selected_option_ids") == str(o1_correct.id)
    assert q1_ans.get("selected_option_id") == str(o1_correct.id)


def test_idempotent_submit_and_result_reload(client, exam_submission_fixture):
    """
    Verify submitting multiple times returns identical result,
    and fetching /attempts/{id}/result after submission remains identical.
    """
    fixture = exam_submission_fixture
    test = fixture["test_single"]
    q1 = fixture["q1"]
    o1_correct = fixture["o1_correct"]

    start_res = client.post(
        "/api/v1/attempts/start",
        json={"access_code": test.code, "candidate_name": "Fiona Candidate"},
    )
    data = start_res.json()
    attempt_id = data["attempt_id"]
    session_id = data["session_id"]

    submit_payload = {
        "session_id": session_id,
        "final_answers": [
            {
                "session_id": session_id,
                "question_id": str(q1.id),
                "selected_option_id": str(o1_correct.id),
            }
        ],
    }

    # First submit
    res1 = client.post(f"/api/v1/attempts/{attempt_id}/submit", json=submit_payload)
    assert res1.status_code == status.HTTP_200_OK
    data1 = res1.json()

    # Second submit (idempotent call)
    res2 = client.post(f"/api/v1/attempts/{attempt_id}/submit", json=submit_payload)
    assert res2.status_code == status.HTTP_200_OK
    data2 = res2.json()

    assert data1["score"] == data2["score"] == 4.0
    assert data1["correct_count"] == data2["correct_count"] == 1
    assert data1["unattempted_count"] == data2["unattempted_count"] == 0

    # Fetch result endpoint
    res_get = client.get(f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}")
    assert res_get.status_code == status.HTTP_200_OK
    data_get = res_get.json()

    assert data_get["score"] == 4.0
    assert data_get["correct_count"] == 1
    assert data_get["unattempted_count"] == 0
    assert data_get["accuracy"] == 100.0
