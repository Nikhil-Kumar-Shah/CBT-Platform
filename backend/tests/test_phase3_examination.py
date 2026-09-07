import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.user import User


@pytest.fixture
def p3_setup(db_session: Session, test_admin: User):
    subj = Subject(name="Phase3 Subject", code="P3SUB", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)
    return {"subject": subj}


def test_test_series_reorder_and_workflow(client: TestClient, auth_headers, p3_setup):
    subj_id = str(p3_setup["subject"].id)

    # 1. Create a series
    s_resp = client.post(
        "/api/v1/test-series",
        json={"name": "JEE Advanced Master Series", "code": "JEE-ADV-2026"},
    )
    assert s_resp.status_code == 201
    series_id = s_resp.json()["id"]

    # 2. Create 3 tests in series
    t1_resp = client.post(
        "/api/v1/tests",
        json={"title": "Test 1 Physics", "subject_id": subj_id, "test_series_id": series_id},
    )
    assert t1_resp.status_code == 201
    t1_id = t1_resp.json()["id"]

    t2_resp = client.post(
        "/api/v1/tests",
        json={"title": "Test 2 Chemistry", "subject_id": subj_id, "test_series_id": series_id},
    )
    assert t2_resp.status_code == 201
    t2_id = t2_resp.json()["id"]

    t3_resp = client.post(
        "/api/v1/tests",
        json={"title": "Test 3 Mathematics", "subject_id": subj_id, "test_series_id": series_id},
    )
    assert t3_resp.status_code == 201
    t3_id = t3_resp.json()["id"]

    # Check series includes tests
    s_detail = client.get(f"/api/v1/test-series/{series_id}").json()
    assert s_detail["test_count"] == 3

    # 3. Reorder tests: Test 3 -> Test 1 -> Test 2
    reorder_resp = client.put(
        f"/api/v1/test-series/{series_id}/tests/reorder",
        json={"test_ids": [t3_id, t1_id, t2_id]},
    )
    assert reorder_resp.status_code == 200
    reordered = reorder_resp.json()
    assert reordered["tests"][0]["id"] == t3_id
    assert reordered["tests"][0]["series_order"] == 1
    assert reordered["tests"][1]["id"] == t1_id
    assert reordered["tests"][1]["series_order"] == 2
    assert reordered["tests"][2]["id"] == t2_id
    assert reordered["tests"][2]["series_order"] == 3


def test_test_lifecycle_scheduled_live_complete_archive_restore(
    client: TestClient, auth_headers, p3_setup
):
    subj_id = str(p3_setup["subject"].id)

    # 1. Create a draft test
    now = datetime.now(timezone.utc)
    future_start = (now + timedelta(days=2)).isoformat()
    future_end = (now + timedelta(days=2, hours=3)).isoformat()

    create_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Scheduled Mock Examination",
            "subject_id": subj_id,
            "duration_minutes": 90,
            "start_time": future_start,
            "end_time": future_end,
        },
    )
    assert create_resp.status_code == 201
    test_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "DRAFT"

    # Try to publish with 0 questions -> must fail
    fail_pub = client.post(f"/api/v1/tests/{test_id}/publish")
    assert fail_pub.status_code == 400
    assert "zero questions" in fail_pub.json()["detail"].lower()

    # Add 1 question
    q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the speed of light?",
            "marks": 4.0,
            "options": [
                {"option_order": 1, "content": "3 x 10^8 m/s", "is_correct": True},
                {"option_order": 2, "content": "3 x 10^6 m/s", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201

    # 2. Publish -> Since start_time is in the future, should be SCHEDULED
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200
    assert pub_resp.json()["status"] == "SCHEDULED"

    # 3. Modify schedule to immediate and set LIVE
    update_resp = client.patch(
        f"/api/v1/tests/{test_id}",
        json={"status": "LIVE", "start_time": None, "end_time": None},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "LIVE"

    # 4. While LIVE: Test administrative correction on question
    q_id = q_resp.json()["questions"][0]["question"]["id"]
    # Structural modification (changing question type) must be blocked:
    blocked_resp = client.put(
        f"/api/v1/tests/{test_id}/questions/{q_id}/inline",
        json={
            "question_type": "NUMERICAL",
            "content": "What is the speed of light?",
            "marks": 4.0,
        },
    )
    assert blocked_resp.status_code == 400

    # Permitted correction (typo in content / hint / explanation) succeeds:
    corr_resp = client.put(
        f"/api/v1/tests/{test_id}/questions/{q_id}/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the exact speed of light in vacuum?",
            "hint": "Think of universal constants",
            "marks": 4.0,
            "options": [
                {"option_order": 1, "content": "3 x 10^8 m/s", "is_correct": True},
                {"option_order": 2, "content": "3 x 10^6 m/s", "is_correct": False},
            ],
        },
    )
    assert corr_resp.status_code == 200

    # Check that ADMIN_CORRECTION is in audit logs
    logs = client.get(f"/api/v1/tests/{test_id}/audit-logs").json()
    actions = [l["action"] for l in logs]
    assert "ADMIN_CORRECTION" in actions

    # 5. Complete test
    comp_resp = client.post(f"/api/v1/tests/{test_id}/complete")
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "COMPLETED"

    # 6. Archive test
    arch_resp = client.delete(f"/api/v1/tests/{test_id}")
    assert arch_resp.status_code == 200
    assert arch_resp.json()["status"] == "ARCHIVED"

    # 7. Restore test
    rest_resp = client.post(f"/api/v1/tests/{test_id}/restore")
    assert rest_resp.status_code == 200
    assert rest_resp.json()["status"] in ("DRAFT", "COMPLETED")


def test_question_deletion_endpoint_and_audit(client: TestClient, auth_headers, p3_setup):
    subj_id = str(p3_setup["subject"].id)

    # 1. Create a draft test with 2 questions
    t_resp = client.post(
        "/api/v1/tests",
        json={"title": "Draft Removal Test", "subject_id": subj_id, "duration_minutes": 45},
    )
    test_id = t_resp.json()["id"]

    q1_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "Question 1",
            "marks": 4.0,
            "options": [
                {"option_order": 1, "content": "A", "is_correct": True},
                {"option_order": 2, "content": "B", "is_correct": False},
            ],
        },
    )
    q2_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "Question 2",
            "marks": 4.0,
            "options": [
                {"option_order": 1, "content": "A", "is_correct": True},
                {"option_order": 2, "content": "B", "is_correct": False},
            ],
        },
    )
    assert q2_resp.json()["question_count"] == 2
    q1_id = q1_resp.json()["questions"][0]["question"]["id"]

    # 2. Delete question 1 via dedicated DELETE endpoint
    del_resp = client.delete(f"/api/v1/tests/{test_id}/questions/{q1_id}")
    assert del_resp.status_code == 200
    del_data = del_resp.json()
    assert del_data["question_count"] == 1
    assert del_data["questions"][0]["order_index"] == 1

    # Check audit log contains QUESTION_DELETED
    logs = client.get(f"/api/v1/tests/{test_id}/audit-logs").json()
    actions = [l["action"] for l in logs]
    assert "QUESTION_DELETED" in actions
