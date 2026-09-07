import uuid
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.test import Test
from backend.app.models.question import Question
from backend.app.models.test_question import TestQuestion
from backend.app.models.test_attempt import TestAttempt
from backend.app.models.subject import Subject
from backend.app.services.dashboard_service import DashboardService


def test_dashboard_kpi_lifecycle_and_counts(client: TestClient, db_session: Session, auth_headers: dict, test_admin):
    user = test_admin
    db = db_session

    subject = Subject(name=f"Dashboard Test Subject {uuid.uuid4().hex[:4]}", code=f"DSH-{uuid.uuid4().hex[:4]}")
    db.add(subject)
    db.flush()

    # 1. Create a Draft test with 0 questions (should be in draft & needs attention)
    draft_test = Test(
        title="Draft Test Empty",
        code=f"DFT-EMPTY-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        duration_minutes=30,
        status="DRAFT",
        created_by=user.id,
    )
    db.add(draft_test)

    # 2. Create a Scheduled test in the future
    future_start = datetime.now(timezone.utc) + timedelta(days=2)
    future_end = future_start + timedelta(hours=2)
    scheduled_test = Test(
        title="Future Scheduled Test",
        code=f"SCH-FUT-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        duration_minutes=60,
        status="SCHEDULED",
        start_time=future_start,
        end_time=future_end,
        created_by=user.id,
    )
    db.add(scheduled_test)

    # 3. Create a Live test with question
    live_test = Test(
        title="Active Live Test",
        code=f"LIV-ACT-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        duration_minutes=45,
        status="LIVE",
        start_time=datetime.now(timezone.utc) - timedelta(minutes=10),
        end_time=datetime.now(timezone.utc) + timedelta(minutes=35),
        created_by=user.id,
    )
    db.add(live_test)
    db.flush()

    q = Question(
        subject_id=subject.id,
        question_type="MCQ",
        content="Sample question?",
        marks=4.0,
        negative_marks=1.0,
        created_by=user.id,
    )
    db.add(q)
    db.flush()

    tq = TestQuestion(
        test_id=live_test.id,
        question_id=q.id,
        order_index=1,
        marks=4.0,
        negative_marks=1.0,
    )
    db.add(tq)

    # 4. Create attempts for live test
    att1 = TestAttempt(
        test_id=live_test.id,
        student_name="Candidate Alpha",
        candidate_email="alpha@test.com",
        status="SUBMITTED",
        score=4.0,
        total_marks=4.0,
    )
    att2 = TestAttempt(
        test_id=live_test.id,
        student_name="Candidate Beta",
        candidate_email="beta@test.com",
        status="IN_PROGRESS",
        score=0.0,
        total_marks=4.0,
    )
    db.add(att1)
    db.add(att2)
    db.commit()

    # Query DashboardService directly and via API
    stats = DashboardService.get_stats(db)

    assert stats.total_tests >= 3
    assert stats.draft_tests >= 1
    assert stats.scheduled_tests >= 1
    assert stats.live_tests >= 1
    assert stats.total_candidates >= 2
    assert stats.total_submissions >= 1
    assert stats.needs_attention >= 1  # Draft test has 0 questions

    # Verify via API endpoint with auth headers
    resp = client.get("/api/v1/dashboard/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_tests"] == stats.total_tests
    assert data["live_tests"] == stats.live_tests
    assert data["scheduled_tests"] == stats.scheduled_tests
    assert data["total_candidates"] == stats.total_candidates
    assert data["total_submissions"] == stats.total_submissions
    assert data["needs_attention"] == stats.needs_attention


def test_dashboard_expired_test_auto_reconciliation(client: TestClient, db_session: Session, auth_headers: dict, test_admin):
    user = test_admin
    db = db_session

    subject = Subject(name=f"Concluded Test Subject {uuid.uuid4().hex[:4]}", code=f"CON-{uuid.uuid4().hex[:4]}")
    db.add(subject)
    db.flush()

    # Test whose end_time has passed while status was LIVE
    past_start = datetime.now(timezone.utc) - timedelta(hours=3)
    past_end = datetime.now(timezone.utc) - timedelta(hours=1)
    past_test = Test(
        title="Past Concluded Test",
        code=f"PST-EXP-{uuid.uuid4().hex[:4]}",
        subject_id=subject.id,
        duration_minutes=60,
        status="LIVE",
        start_time=past_start,
        end_time=past_end,
        created_by=user.id,
    )
    db.add(past_test)
    db.commit()

    # Calling dashboard stats must reconcile past_test to COMPLETED
    stats = DashboardService.get_stats(db)
    reconciled_test = db.get(Test, past_test.id)
    assert reconciled_test.status == "COMPLETED"
    assert stats.completed_tests >= 1
