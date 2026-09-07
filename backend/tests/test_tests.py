import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.models.subject import Subject
from backend.app.models.topic import Topic
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption


@pytest.fixture
def auth_headers(client: TestClient, test_admin: User) -> dict:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": test_admin.username, "password": "SecretAdminPass123!"},
    )
    assert resp.status_code == 200
    token = resp.cookies[settings.SESSION_COOKIE_NAME]
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    return {}


@pytest.fixture
def test_setup_data(db_session: Session, test_admin: User):
    uid = uuid.uuid4().hex[:5].upper()
    subject = Subject(name=f"Subj_{uid}", code=f"S{uid}", status="ACTIVE")
    db_session.add(subject)
    db_session.flush()

    topic = Topic(subject_id=subject.id, name=f"Topic_{uid}", status="ACTIVE")
    db_session.add(topic)
    db_session.flush()

    # Question 1 (MCQ)
    q1 = Question(
        question_type="MCQ",
        subject_id=subject.id,
        topic_id=topic.id,
        difficulty="EASY",
        content="What is acceleration due to gravity?",
        explanation="Near Earth surface it is ~9.8 m/s^2",
        marks=4.0,
        negative_marks=1.0,
        status="ACTIVE",
        created_by=test_admin.id,
    )
    db_session.add(q1)
    db_session.flush()

    opt1 = QuestionOption(question_id=q1.id, option_order=1, content="9.8 m/s^2", is_correct=True)
    opt2 = QuestionOption(question_id=q1.id, option_order=2, content="8.9 m/s^2", is_correct=False)
    db_session.add_all([opt1, opt2])

    # Question 2 (Numerical)
    q2 = Question(
        question_type="NUMERICAL",
        subject_id=subject.id,
        topic_id=topic.id,
        difficulty="MEDIUM",
        content="Find distance in 2 seconds with initial velocity 0 and acceleration 5 m/s^2.",
        explanation="s = 0.5 * 5 * 4 = 10",
        marks=4.0,
        negative_marks=0.0,
        numerical_answer=10.0,
        numerical_tolerance=0.1,
        status="ACTIVE",
        created_by=test_admin.id,
    )
    db_session.add(q2)
    db_session.commit()

    return {
        "subject": subject,
        "topic": topic,
        "q1": q1,
        "q2": q2,
    }


def test_create_test_series(client: TestClient, auth_headers):
    uid = uuid.uuid4().hex[:6]
    resp = client.post(
        "/api/v1/test-series",
        json={
            "name": f"JEE Physics Series {uid}",
            "description": "Comprehensive Physics series for JEE Advanced",
            "status": "PUBLISHED",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert f"JEE Physics Series {uid}" in data["name"]
    assert "code" in data
    assert data["status"] == "PUBLISHED"
    assert data["test_count"] == 0


def test_create_test_with_auto_code(client: TestClient, auth_headers, test_setup_data):
    subject_id = str(test_setup_data["subject"].id)
    resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Mechanics Full Mock",
            "subject_id": subject_id,
            "duration_minutes": 60,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Mechanics Full Mock"
    assert len(data["code"]) == 6 and data["code"].isalnum()
    assert data["status"] == "DRAFT"
    assert data["question_count"] == 0


def test_sync_questions_and_reorder(client: TestClient, auth_headers, test_setup_data):
    subject_id = str(test_setup_data["subject"].id)
    q1_id = str(test_setup_data["q1"].id)
    q2_id = str(test_setup_data["q2"].id)

    # Create test
    test_resp = client.post(
        "/api/v1/tests",
        json={"title": "Kinematics Test", "subject_id": subject_id},
    )
    test_id = test_resp.json()["id"]

    # Sync questions: q2 as #1, q1 as #2
    sync_resp = client.put(
        f"/api/v1/tests/{test_id}/questions",
        json={
            "questions": [
                {"question_id": q2_id, "order_index": 1, "marks": 4.0, "negative_marks": 0.0},
                {"question_id": q1_id, "order_index": 2, "marks": 4.0, "negative_marks": 1.0},
            ]
        },
    )
    assert sync_resp.status_code == 200
    data = sync_resp.json()
    assert data["question_count"] == 2
    assert data["questions"][0]["question_id"] == q2_id
    assert data["questions"][0]["order_index"] == 1
    assert data["questions"][1]["question_id"] == q1_id
    assert data["questions"][1]["order_index"] == 2


def test_publish_test_validation(client: TestClient, auth_headers, test_setup_data):
    # Empty test cannot be published
    test_resp = client.post(
        "/api/v1/tests",
        json={"title": "Empty Test"},
    )
    test_id = test_resp.json()["id"]

    fail_pub = client.post(f"/api/v1/tests/{test_id}/publish")
    assert fail_pub.status_code == 400
    assert "zero questions" in fail_pub.json()["detail"]

    # Add question then publish
    q1_id = str(test_setup_data["q1"].id)
    client.put(
        f"/api/v1/tests/{test_id}/questions",
        json={"questions": [{"question_id": q1_id, "order_index": 1}]},
    )

    success_pub = client.post(f"/api/v1/tests/{test_id}/publish")
    assert success_pub.status_code == 200
    assert success_pub.json()["status"] in ("PUBLISHED", "LIVE")


def test_duplicate_test(client: TestClient, auth_headers, test_setup_data):
    q1_id = str(test_setup_data["q1"].id)
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Original Test",
            "question_ids": [q1_id],
        },
    )
    test_id = test_resp.json()["id"]

    dup_resp = client.post(f"/api/v1/tests/{test_id}/duplicate")
    assert dup_resp.status_code == 200
    dup_data = dup_resp.json()
    assert dup_data["title"] == "Original Test (Copy)"
    assert dup_data["id"] != test_id
    assert dup_data["question_count"] == 1


def test_dashboard_stats(client: TestClient, auth_headers):
    resp = client.get("/api/v1/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_tests" in data
    assert "published_tests" in data
    assert "draft_tests" in data
    assert "recent_tests" in data


def test_batch_add_questions_inline(client: TestClient, auth_headers, test_setup_data):
    subject_id = str(test_setup_data["subject"].id)
    test_resp = client.post(
        "/api/v1/tests",
        json={"title": "Batch Question Test", "subject_id": subject_id},
    )
    test_id = test_resp.json()["id"]

    batch_payload = {
        "questions": [
            {
                "question_type": "MCQ",
                "difficulty": "EASY",
                "content": "Solve for x: $x^2 - 4 = 0$",
                "options": [
                    {"option_order": 1, "content": "$x = \\pm 2$", "is_correct": True},
                    {"option_order": 2, "content": "$x = 4$", "is_correct": False},
                ],
            },
            {
                "question_type": "NUMERICAL",
                "difficulty": "MEDIUM",
                "content": "Compute $\\int_0^2 2x \\, dx$",
                "numerical_answer": 4.0,
                "numerical_tolerance": 0.0,
            },
        ]
    }

    batch_resp = client.post(f"/api/v1/tests/{test_id}/questions/batch", json=batch_payload)
    assert batch_resp.status_code == 201
    data = batch_resp.json()
    assert data["question_count"] == 2
    assert len(data["questions"]) == 2
    assert data["questions"][0]["question"]["content"] == "Solve for x: $x^2 - 4 = 0$"
    assert data["questions"][1]["question"]["content"] == "Compute $\\int_0^2 2x \\, dx$"
