import csv
import io
import uuid
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


def test_phase8_test_overview_and_performance_analytics(client: TestClient, db_session: Session, test_admin: User, auth_headers: dict):
    # 1. Create a subject & test
    subject = Subject(name=f"Physics-{uuid.uuid4().hex[:6]}", code=f"PHY-{uuid.uuid4().hex[:4]}")
    db_session.add(subject)
    db_session.commit()

    test = TestModel(
        title="Physics Thermodynamics Grand Test",
        code=f"PHY-THERMO-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        created_by=test_admin.id,
        duration_minutes=90,
        positive_marks=4.0,
        negative_marks=1.0,
        status="COMPLETED",
    )
    db_session.add(test)
    db_session.commit()

    # 2. Add 3 questions (MCQ easy, MCQ hard, Numerical moderate)
    q1 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="First Law of Thermodynamics represents conservation of?",
        marks=4.0,
        negative_marks=1.0,
    )
    db_session.add(q1)
    db_session.flush()
    opt1_a = QuestionOption(question_id=q1.id, content="Energy", is_correct=True, option_order=1)
    opt1_b = QuestionOption(question_id=q1.id, content="Mass", is_correct=False, option_order=2)
    opt1_c = QuestionOption(question_id=q1.id, content="Momentum", is_correct=False, option_order=3)
    db_session.add_all([opt1_a, opt1_b, opt1_c])

    q2 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="Efficiency of Carnot engine between 300K and 600K is?",
        marks=4.0,
        negative_marks=1.0,
    )
    db_session.add(q2)
    db_session.flush()
    opt2_a = QuestionOption(question_id=q2.id, content="50%", is_correct=True, option_order=1)
    opt2_b = QuestionOption(question_id=q2.id, content="25%", is_correct=False, option_order=2)
    opt2_c = QuestionOption(question_id=q2.id, content="75%", is_correct=False, option_order=3)
    db_session.add_all([opt2_a, opt2_b, opt2_c])

    q3 = Question(
        subject_id=subject.id,
        question_type="NUMERICAL",
        content="Work done in isobaric expansion (in Joules):",
        marks=4.0,
        negative_marks=0.0,
        numerical_answer=150.0,
        numerical_tolerance=0.0,
    )
    db_session.add(q3)
    db_session.commit()

    tq1 = TestQuestionModel(test_id=test.id, question_id=q1.id, order_index=1, marks=4.0, negative_marks=1.0)
    tq2 = TestQuestionModel(test_id=test.id, question_id=q2.id, order_index=2, marks=4.0, negative_marks=1.0)
    tq3 = TestQuestionModel(test_id=test.id, question_id=q3.id, order_index=3, marks=4.0, negative_marks=0.0)
    db_session.add_all([tq1, tq2, tq3])
    db_session.commit()

    # 3. Create 3 finalized attempts and 1 in-progress attempt
    # Candidate 1: High scorer (12.0/12.0)
    att1 = TestAttemptModel(
        test_id=test.id,
        student_name="Diana Prince",
        roll_number="ROLL-101",
        score=12.0,
        total_marks=12.0,
        percentage=100.0,
        correct_count=3,
        incorrect_count=0,
        unattempted_count=0,
        time_taken_seconds=2400,
        status="SUBMITTED",
        submitted_at=datetime.now(timezone.utc),
    )
    db_session.add(att1)
    db_session.flush()
    db_session.add_all([
        TestAttemptAnswerModel(attempt_id=att1.id, question_id=q1.id, selected_option_ids=str(opt1_a.id), is_correct=True, marks_awarded=4.0),
        TestAttemptAnswerModel(attempt_id=att1.id, question_id=q2.id, selected_option_ids=str(opt2_a.id), is_correct=True, marks_awarded=4.0),
        TestAttemptAnswerModel(attempt_id=att1.id, question_id=q3.id, numerical_answer=150.0, is_correct=True, marks_awarded=4.0),
    ])

    # Candidate 2: Medium scorer (7.0/12.0)
    # Correct Q1, Wrong Q2 (-1), Correct Q3 (4) = 7.0
    att2 = TestAttemptModel(
        test_id=test.id,
        student_name="Bruce Wayne",
        roll_number="ROLL-102",
        score=7.0,
        total_marks=12.0,
        percentage=58.3,
        correct_count=2,
        incorrect_count=1,
        unattempted_count=0,
        time_taken_seconds=3000,
        status="SUBMITTED",
        submitted_at=datetime.now(timezone.utc),
    )
    db_session.add(att2)
    db_session.flush()
    db_session.add_all([
        TestAttemptAnswerModel(attempt_id=att2.id, question_id=q1.id, selected_option_ids=str(opt1_a.id), is_correct=True, marks_awarded=4.0),
        TestAttemptAnswerModel(attempt_id=att2.id, question_id=q2.id, selected_option_ids=str(opt2_b.id), is_correct=False, marks_awarded=-1.0),
        TestAttemptAnswerModel(attempt_id=att2.id, question_id=q3.id, numerical_answer=150.0, is_correct=True, marks_awarded=4.0),
    ])

    # Candidate 3: Lower scorer (3.0/12.0)
    # Correct Q1, Unattempted Q2, Wrong Q3 = 4.0 + 0 + 0 = 4.0
    att3 = TestAttemptModel(
        test_id=test.id,
        student_name="Clark Kent",
        roll_number="ROLL-103",
        score=4.0,
        total_marks=12.0,
        percentage=33.3,
        correct_count=1,
        incorrect_count=1,
        unattempted_count=1,
        time_taken_seconds=1800,
        status="SUBMITTED",
        submitted_at=datetime.now(timezone.utc),
    )
    db_session.add(att3)
    db_session.flush()
    db_session.add_all([
        TestAttemptAnswerModel(attempt_id=att3.id, question_id=q1.id, selected_option_ids=str(opt1_a.id), is_correct=True, marks_awarded=4.0),
        TestAttemptAnswerModel(attempt_id=att3.id, question_id=q2.id, selected_option_ids=None, is_correct=False, marks_awarded=0.0),
        TestAttemptAnswerModel(attempt_id=att3.id, question_id=q3.id, numerical_answer=200.0, is_correct=False, marks_awarded=0.0),
    ])

    # Candidate 4: In progress candidate (Must NOT be counted in score averages/ranges)
    att4 = TestAttemptModel(
        test_id=test.id,
        student_name="Barry Allen",
        roll_number="ROLL-104",
        score=0.0,
        total_marks=12.0,
        percentage=0.0,
        correct_count=0,
        incorrect_count=0,
        unattempted_count=3,
        time_taken_seconds=0,
        status="IN_PROGRESS",
    )
    db_session.add(att4)
    db_session.commit()

    # 4. GET /api/v1/tests/{id}/analytics
    resp = client.get(f"/api/v1/tests/{test.id}/analytics", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Verify Header & Overview
    assert data["test_title"] == "Physics Thermodynamics Grand Test"
    assert data["test_status"] == "COMPLETED"
    assert data["subject_name"] == subject.name
    assert data["total_questions"] == 3
    assert data["total_marks"] == 12.0
    assert data["duration_minutes"] == 90

    # Verify Participation counts
    assert data["total_participants"] == 4
    assert data["completed_submissions"] == 3
    assert data["in_progress_count"] == 1
    assert data["not_started_count"] == 0
    assert data["completion_rate"] == 75.0
    assert data["submission_rate"] == 75.0

    # Verify Score Statistics (Evaluated ONLY from 3 submitted attempts: 12, 7, 4)
    # Average = (12 + 7 + 4) / 3 = 23 / 3 = 7.67
    assert data["highest_score"] == 12.0
    assert data["lowest_score"] == 4.0
    assert data["average_score"] == 7.67
    assert data["median_score"] == 7.0
    # Average accuracy across all submitted attempts:
    # Total correct = 3 + 2 + 1 = 6; Total attempted = 3 + 3 + 2 = 8; 6 / 8 = 75.0%
    assert data["average_accuracy"] == 75.0

    # Verify Question Performance & Empirical Difficulty
    q_perf = {item["order_index"]: item for item in data["question_performance"]}
    # Q1: 3 attempted, 3 correct -> accuracy 100% -> EASY
    assert q_perf[1]["attempted_count"] == 3
    assert q_perf[1]["correct_count"] == 3
    assert q_perf[1]["accuracy_percentage"] == 100.0
    assert q_perf[1]["difficulty"] == "EASY"
    assert q_perf[1]["is_easiest"] is True

    # Check option distribution for Q1
    q1_opt_dist = q_perf[1]["option_distribution"]
    assert q1_opt_dist is not None
    assert len(q1_opt_dist) == 3
    # Option A was selected by all 3 candidates
    opt_a_item = next(o for o in q1_opt_dist if o["option_label"] == "A")
    assert opt_a_item["selection_count"] == 3
    assert opt_a_item["is_correct"] is True

    # Q2: 2 attempted (1 unattempted), 1 correct -> accuracy 50% -> MODERATE
    assert q_perf[2]["attempted_count"] == 2
    assert q_perf[2]["unattempted_count"] == 1
    assert q_perf[2]["accuracy_percentage"] == 50.0
    assert q_perf[2]["difficulty"] == "MODERATE"

    # Q3: 3 attempted, 2 correct, 1 wrong (numerical average: (150 + 150 + 200)/3 = 166.67)
    assert q_perf[3]["question_type"] == "NUMERICAL"
    assert q_perf[3]["attempted_count"] == 3
    assert q_perf[3]["correct_count"] == 2
    assert q_perf[3]["average_numerical_value"] == 166.67

    # Verify Student Ranking & Accuracy
    students = data["student_submissions"]
    assert len(students) == 4
    assert students[0]["student_name"] == "Diana Prince"
    assert students[0]["rank"] == 1
    assert students[0]["accuracy"] == 100.0
    assert students[1]["student_name"] == "Bruce Wayne"
    assert students[1]["rank"] == 2
    assert round(students[1]["accuracy"], 1) == 66.7
    assert students[2]["student_name"] == "Clark Kent"
    assert students[2]["rank"] == 3
    assert round(students[2]["accuracy"], 1) == 50.0
    assert students[3]["status"] == "IN_PROGRESS"


def test_phase8_candidate_and_question_csv_exports(client: TestClient, db_session: Session, test_admin: User, auth_headers: dict):
    # 1. Create a test with known data
    subject = Subject(name=f"Chemistry-{uuid.uuid4().hex[:6]}", code=f"CHM-{uuid.uuid4().hex[:4]}")
    db_session.add(subject)
    db_session.commit()

    test = TestModel(
        title="Organic Chemistry Midterm, 2026",
        code=f"CHEM-EXP-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        created_by=test_admin.id,
        duration_minutes=60,
        positive_marks=4.0,
        negative_marks=1.0,
        status="COMPLETED",
    )
    db_session.add(test)
    db_session.commit()

    q1 = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content='Identify electrophile, e.g. "H+" or NO2+:',
        marks=4.0,
        negative_marks=1.0,
    )
    db_session.add(q1)
    db_session.flush()
    opt1 = QuestionOption(question_id=q1.id, content="NO2+", is_correct=True, option_order=1)
    db_session.add(opt1)
    db_session.commit()

    tq1 = TestQuestionModel(test_id=test.id, question_id=q1.id, order_index=1, marks=4.0, negative_marks=1.0)
    db_session.add(tq1)

    # Name containing comma and quote to test CSV escaping
    tricky_name = 'Smith, "Neo" Jr.'
    att = TestAttemptModel(
        test_id=test.id,
        student_name=tricky_name,
        roll_number="ROLL-TRICKY",
        score=4.0,
        total_marks=4.0,
        percentage=100.0,
        correct_count=1,
        incorrect_count=0,
        unattempted_count=0,
        time_taken_seconds=600,
        status="SUBMITTED",
        submitted_at=datetime(2026, 9, 6, 12, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add(att)
    db_session.flush()
    db_session.add(
        TestAttemptAnswerModel(attempt_id=att.id, question_id=q1.id, selected_option_ids=str(opt1.id), is_correct=True, marks_awarded=4.0)
    )
    db_session.commit()

    # 2. Export Candidate CSV
    csv_resp = client.get(f"/api/v1/tests/{test.id}/results/export/csv", headers=auth_headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "attachment" in csv_resp.headers["content-disposition"]

    # Parse and verify CSV contents
    reader = list(csv.reader(io.StringIO(csv_resp.text)))
    headers = reader[0]
    assert headers == [
        "Candidate Name",
        "Roll Number",
        "Test",
        "Subject",
        "Attempt Status",
        "Score",
        "Maximum Marks",
        "Percentage",
        "Accuracy",
        "Correct",
        "Incorrect",
        "Unattempted",
        "Time Taken Seconds",
        "Submitted At",
    ]
    assert len(reader) == 2  # Header + 1 row
    row = reader[1]
    assert row[0] == tricky_name
    assert row[1] == "ROLL-TRICKY"
    assert row[2] == "Organic Chemistry Midterm, 2026"
    assert row[5] == "4.0"
    assert row[7] == "100.0%"
    assert row[8] == "100.0%"

    # 3. Export Question Analysis CSV
    q_csv_resp = client.get(f"/api/v1/tests/{test.id}/questions/export/csv", headers=auth_headers)
    assert q_csv_resp.status_code == 200
    assert "text/csv" in q_csv_resp.headers["content-type"]
    q_reader = list(csv.reader(io.StringIO(q_csv_resp.text)))
    q_headers = q_reader[0]
    assert q_headers == [
        "Question Number",
        "Question Type",
        "Maximum Marks",
        "Attempted",
        "Correct",
        "Incorrect",
        "Unattempted",
        "Accuracy",
        "Average Marks",
        "Difficulty",
    ]
    assert len(q_reader) == 2
    q_row = q_reader[1]
    assert q_row[0] == "Q1"
    assert q_row[1] == "MCQ"
    assert q_row[2] == "4.0"
    assert q_row[3] == "1"
    assert q_row[7] == "100.0%"
    assert q_row[9] == "EASY"


def test_phase8_security_and_unauthorized_rejection(client: TestClient, db_session: Session):
    # Try fetching analytics without token -> 401 Unauthorized
    dummy_id = uuid.uuid4()
    resp1 = client.get(f"/api/v1/tests/{dummy_id}/analytics")
    assert resp1.status_code == 401

    # Try exporting CSV without token -> 401 Unauthorized
    resp2 = client.get(f"/api/v1/tests/{dummy_id}/results/export/csv")
    assert resp2.status_code == 401

    resp3 = client.get(f"/api/v1/tests/{dummy_id}/questions/export/csv")
    assert resp3.status_code == 401


def test_phase8_empty_state_no_submissions(client: TestClient, db_session: Session, test_admin: User, auth_headers: dict):
    # Create test with zero attempts
    test = TestModel(
        title="Empty Test 0 Attempts",
        code=f"EMPTY-{uuid.uuid4().hex[:4]}",
        created_by=test_admin.id,
        duration_minutes=30,
        positive_marks=4.0,
        negative_marks=1.0,
        status="DRAFT",
    )
    db_session.add(test)
    db_session.commit()

    resp = client.get(f"/api/v1/tests/{test.id}/analytics", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_participants"] == 0
    assert data["completed_submissions"] == 0
    assert data["average_score"] == 0.0
    assert data["highest_score"] == 0.0
    assert data["lowest_score"] == 0.0
    assert data["median_score"] == 0.0
    assert data["average_accuracy"] == 0.0
    assert len(data["student_submissions"]) == 0
    assert len(data["question_performance"]) == 0

    # CSV exports for empty test should cleanly produce headers without crashing
    csv_resp = client.get(f"/api/v1/tests/{test.id}/results/export/csv", headers=auth_headers)
    assert csv_resp.status_code == 200
    reader = list(csv.reader(io.StringIO(csv_resp.text)))
    assert len(reader) == 1  # Headers only
