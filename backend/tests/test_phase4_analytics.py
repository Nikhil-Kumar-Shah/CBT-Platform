import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.test import Test as TestModel
from backend.app.models.test_question import TestQuestion as TestQuestionModel
from backend.app.models.test_attempt import TestAttempt as TestAttemptModel, TestAttemptAnswer as TestAttemptAnswerModel
from backend.app.models.user import User

TestModel.__test__ = False
TestQuestionModel.__test__ = False
TestAttemptModel.__test__ = False
TestAttemptAnswerModel.__test__ = False


def test_phase4_analytics_and_monitoring_metrics(client: TestClient, db_session: Session, test_admin: User, auth_headers: dict):
    # 1. Create a subject & test
    subject = Subject(name=f"Math-{uuid.uuid4().hex[:6]}", code=f"MTH-{uuid.uuid4().hex[:4]}")
    db_session.add(subject)
    db_session.commit()

    test = TestModel(
        title="Calculus Midterm Analytics Test",
        code=f"CALC-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        created_by=test_admin.id,
        duration_minutes=60,
        positive_marks=4.0,
        negative_marks=1.0,
        status="LIVE",
    )
    db_session.add(test)
    db_session.commit()

    # 2. Create questions with options
    q1 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="What is derivative of sin(x)?",
        marks=4.0,
        negative_marks=1.0,
    )
    db_session.add(q1)
    db_session.flush()

    opt1 = QuestionOption(question_id=q1.id, content="cos(x)", is_correct=True, option_order=1)
    opt2 = QuestionOption(question_id=q1.id, content="-cos(x)", is_correct=False, option_order=2)
    db_session.add_all([opt1, opt2])
    db_session.commit()

    q2 = Question(
        subject_id=subject.id,
        question_type="NUMERICAL",
        content="Evaluate integral of x dx from 0 to 2.",
        marks=4.0,
        negative_marks=0.0,
        numerical_answer=2.0,
        numerical_tolerance=0.0,
    )
    db_session.add(q2)
    db_session.commit()

    tq1 = TestQuestionModel(test_id=test.id, question_id=q1.id, order_index=1, marks=4.0, negative_marks=1.0)
    tq2 = TestQuestionModel(test_id=test.id, question_id=q2.id, order_index=2, marks=4.0, negative_marks=0.0)
    db_session.add_all([tq1, tq2])
    db_session.commit()

    # 3. Create attempts: 2 completed, 1 in progress
    att1 = TestAttemptModel(
        test_id=test.id,
        student_name="Alice Candidate",
        roll_number="ROLL-001",
        score=8.0,
        total_marks=8.0,
        percentage=100.0,
        correct_count=2,
        incorrect_count=0,
        unattempted_count=0,
        time_taken_seconds=1200,
        status="SUBMITTED",
        submitted_at=datetime.now(timezone.utc),
    )
    db_session.add(att1)
    db_session.flush()

    ans1_1 = TestAttemptAnswerModel(
        attempt_id=att1.id,
        question_id=q1.id,
        selected_option_ids=str(opt1.id),
        is_correct=True,
        marks_awarded=4.0,
    )
    ans1_2 = TestAttemptAnswerModel(
        attempt_id=att1.id,
        question_id=q2.id,
        numerical_answer=2.0,
        is_correct=True,
        marks_awarded=4.0,
    )
    db_session.add_all([ans1_1, ans1_2])

    att2 = TestAttemptModel(
        test_id=test.id,
        student_name="Bob Candidate",
        roll_number="ROLL-002",
        score=3.0,
        total_marks=8.0,
        percentage=37.5,
        correct_count=1,
        incorrect_count=1,
        unattempted_count=0,
        time_taken_seconds=1800,
        status="SUBMITTED",
        submitted_at=datetime.now(timezone.utc),
    )
    db_session.add(att2)
    db_session.flush()

    ans2_1 = TestAttemptAnswerModel(
        attempt_id=att2.id,
        question_id=q1.id,
        selected_option_ids=str(opt2.id),
        is_correct=False,
        marks_awarded=-1.0,
    )
    ans2_2 = TestAttemptAnswerModel(
        attempt_id=att2.id,
        question_id=q2.id,
        numerical_answer=2.0,
        is_correct=True,
        marks_awarded=4.0,
    )
    db_session.add_all([ans2_1, ans2_2])

    att3 = TestAttemptModel(
        test_id=test.id,
        student_name="Charlie Active",
        roll_number="ROLL-003",
        score=0.0,
        total_marks=8.0,
        percentage=0.0,
        correct_count=0,
        incorrect_count=0,
        unattempted_count=2,
        time_taken_seconds=0,
        status="IN_PROGRESS",
    )
    db_session.add(att3)
    db_session.commit()

    # 4. Fetch test analytics
    resp = client.get(f"/api/v1/tests/{test.id}/analytics", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["test_title"] == "Calculus Midterm Analytics Test"
    assert data["test_status"] == "LIVE"
    assert data["total_participants"] == 3
    assert data["completed_submissions"] == 2
    assert data["in_progress_count"] == 1
    assert data["not_started_count"] == 0

    assert data["highest_score"] == 8.0
    assert data["lowest_score"] == 3.0
    assert data["average_score"] == 5.5
    assert data["median_score"] == 5.5
    assert data["completion_rate"] == 66.7

    # Check Question Performance & Difficulty tagging
    q_perf = data["question_performance"]
    assert len(q_perf) == 2
    for item in q_perf:
        assert "difficulty" in item
        assert "average_marks" in item
        assert "is_easiest" in item
        assert "is_most_difficult" in item

    # Check Student Submissions list includes completed and in-progress
    submissions = data["student_submissions"]
    assert len(submissions) == 3
    assert submissions[0]["student_name"] == "Alice Candidate"
    assert submissions[0]["rank"] == 1
    assert submissions[0]["status"] == "SUBMITTED"
    assert submissions[1]["student_name"] == "Bob Candidate"
    assert submissions[1]["rank"] == 2
    assert submissions[2]["student_name"] == "Charlie Active"
    assert submissions[2]["status"] == "IN_PROGRESS"

    # 5. Fetch student submission detail
    det_resp = client.get(f"/api/v1/tests/attempts/{att1.id}/detail", headers=auth_headers)
    assert det_resp.status_code == 200, det_resp.text
    det_data = det_resp.json()
    assert det_data["student_name"] == "Alice Candidate"
    assert len(det_data["answers"]) == 2
    # Verify MCQ answer was formatted cleanly with option label
    ans1_detail = next(a for a in det_data["answers"] if a["question_type"] == "MCQ")
    assert "cos(x)" in ans1_detail["correct_answer"]
    assert "cos(x)" in ans1_detail["student_answer"]
    assert ans1_detail["is_correct"] is True
    assert ans1_detail["marks_awarded"] == 4.0
