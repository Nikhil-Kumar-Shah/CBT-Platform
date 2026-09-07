import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.models.subject import Subject
from backend.app.models.topic import Topic
from backend.app.models.question import Question


@pytest.fixture
def auth_headers(client: TestClient, test_admin: User) -> dict:
    """Login fixture that populates client cookies and returns headers."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": test_admin.username, "password": "SecretAdminPass123!"},
    )
    assert resp.status_code == 200
    token = resp.cookies[settings.SESSION_COOKIE_NAME]
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    return {}


@pytest.fixture
def test_subject(db_session: Session) -> Subject:
    uid = uuid.uuid4().hex[:5].upper()
    subject = Subject(name=f"Physics_{uid}", code=f"P{uid}", status="ACTIVE")
    db_session.add(subject)
    db_session.commit()
    db_session.refresh(subject)
    return subject


@pytest.fixture
def test_topic(db_session: Session, test_subject: Subject) -> Topic:
    topic = Topic(subject_id=test_subject.id, name="Kinematics", status="ACTIVE")
    db_session.add(topic)
    db_session.commit()
    db_session.refresh(topic)
    return topic


def test_subject_and_topic_crud(client: TestClient, auth_headers):
    # 1. Create Subject
    resp = client.post("/api/v1/subjects", json={"name": "Mathematics", "code": "MATH01"})
    assert resp.status_code == 201
    subj_data = resp.json()
    assert subj_data["name"] == "Mathematics"
    subj_id = subj_data["id"]

    # 2. Duplicate Subject check
    dup_resp = client.post("/api/v1/subjects", json={"name": "Mathematics", "code": "MTH001"})
    assert dup_resp.status_code == 409

    # 3. Create Topic
    topic_resp = client.post(
        "/api/v1/topics",
        json={"subject_id": subj_id, "name": "Calculus"},
    )
    assert topic_resp.status_code == 201
    topic_data = topic_resp.json()
    assert topic_data["name"] == "Calculus"

    # 4. Duplicate Topic under same subject check
    dup_topic = client.post(
        "/api/v1/topics",
        json={"subject_id": subj_id, "name": "Calculus"},
    )
    assert dup_topic.status_code == 409

    # 5. List Topics filtered by subject
    list_topics = client.get(f"/api/v1/topics?subject_id={subj_id}")
    assert list_topics.status_code == 200
    assert len(list_topics.json()) == 1


def test_create_mcq_success(client: TestClient, auth_headers, test_subject: Subject, test_topic: Topic):
    payload = {
        "question_type": "MCQ",
        "subject_id": str(test_subject.id),
        "topic_id": str(test_topic.id),
        "difficulty": "MEDIUM",
        "content": "What is the acceleration due to gravity on Earth? Given $g = 9.8 \\text{ m/s}^2$.",
        "explanation": "Standard acceleration due to gravity near Earth surface.",
        "marks": 4.0,
        "negative_marks": 1.0,
        "options": [
            {"option_order": 1, "content": "$9.8\\text{ m/s}^2$", "is_correct": True},
            {"option_order": 2, "content": "$8.9\\text{ m/s}^2$", "is_correct": False},
            {"option_order": 3, "content": "$10.8\\text{ m/s}^2$", "is_correct": False},
            {"option_order": 4, "content": "$0\\text{ m/s}^2$", "is_correct": False},
        ],
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["question_type"] == "MCQ"
    assert data["subject_name"] == test_subject.name
    assert data["topic_name"] == "Kinematics"
    assert len(data["options"]) == 4
    correct_opt = [o for o in data["options"] if o["is_correct"]]
    assert len(correct_opt) == 1
    assert correct_opt[0]["option_order"] == 1


def test_mcq_validation_no_correct_option(client: TestClient, auth_headers, test_subject: Subject):
    payload = {
        "question_type": "MCQ",
        "subject_id": str(test_subject.id),
        "content": "No correct option question",
        "options": [
            {"option_order": 1, "content": "Option 1", "is_correct": False},
            {"option_order": 2, "content": "Option 2", "is_correct": False},
        ],
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 400
    assert "exactly 1 correct option" in resp.json()["detail"]


def test_mcq_validation_multiple_correct_options(client: TestClient, auth_headers, test_subject: Subject):
    payload = {
        "question_type": "MCQ",
        "subject_id": str(test_subject.id),
        "content": "Multiple correct options question",
        "options": [
            {"option_order": 1, "content": "Option 1", "is_correct": True},
            {"option_order": 2, "content": "Option 2", "is_correct": True},
        ],
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 400
    assert "exactly 1 correct option" in resp.json()["detail"]


def test_mcq_validation_fewer_than_two_options(client: TestClient, auth_headers, test_subject: Subject):
    payload = {
        "question_type": "MCQ",
        "subject_id": str(test_subject.id),
        "content": "Single option question",
        "options": [
            {"option_order": 1, "content": "Option 1", "is_correct": True},
        ],
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 400
    assert "at least 2 options" in resp.json()["detail"]


def test_create_numerical_success(client: TestClient, auth_headers, test_subject: Subject, test_topic: Topic):
    payload = {
        "question_type": "NUMERICAL",
        "subject_id": str(test_subject.id),
        "topic_id": str(test_topic.id),
        "difficulty": "HARD",
        "content": "Calculate the escape velocity from Earth in km/s.",
        "explanation": "Escape velocity is approximately $11.2\\text{ km/s}$.",
        "marks": 4.0,
        "negative_marks": 0.0,
        "numerical_answer": 11.2,
        "numerical_tolerance": 0.1,
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["question_type"] == "NUMERICAL"
    assert data["numerical_answer"] == 11.2
    assert data["numerical_tolerance"] == 0.1
    assert len(data["options"]) == 0


def test_numerical_validation_missing_answer(client: TestClient, auth_headers, test_subject: Subject):
    payload = {
        "question_type": "NUMERICAL",
        "subject_id": str(test_subject.id),
        "content": "Missing numerical answer",
        "numerical_answer": None,
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 400
    assert "must have a correct numerical answer" in resp.json()["detail"]


def test_numerical_validation_with_options(client: TestClient, auth_headers, test_subject: Subject):
    payload = {
        "question_type": "NUMERICAL",
        "subject_id": str(test_subject.id),
        "content": "Numerical question with options",
        "numerical_answer": 42.0,
        "options": [
            {"option_order": 1, "content": "Option 1", "is_correct": True},
        ],
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 400
    assert "cannot have options" in resp.json()["detail"]


def test_topic_mismatch_validation(client: TestClient, auth_headers, db_session: Session, test_subject: Subject):
    # Create other subject
    other_subj = Subject(name="Chemistry", code="CHEM", status="ACTIVE")
    db_session.add(other_subj)
    db_session.commit()
    # Create topic under other subject
    chem_topic = Topic(subject_id=other_subj.id, name="Organic Chemistry", status="ACTIVE")
    db_session.add(chem_topic)
    db_session.commit()

    # Try creating Physics question with Chemistry topic
    payload = {
        "question_type": "NUMERICAL",
        "subject_id": str(test_subject.id),
        "topic_id": str(chem_topic.id),
        "content": "Cross-subject topic mismatch",
        "numerical_answer": 5.0,
    }
    resp = client.post("/api/v1/questions", json=payload)
    assert resp.status_code == 400
    assert "does not belong to subject" in resp.json()["detail"]


def test_question_update_and_archive(client: TestClient, auth_headers, test_subject: Subject):
    # 1. Create MCQ
    create_resp = client.post(
        "/api/v1/questions",
        json={
            "question_type": "MCQ",
            "subject_id": str(test_subject.id),
            "content": "Initial question content",
            "marks": 3.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "A", "is_correct": True},
                {"option_order": 2, "content": "B", "is_correct": False},
            ],
        },
    )
    assert create_resp.status_code == 201
    q_id = create_resp.json()["id"]

    # 2. Update content and options
    update_resp = client.patch(
        f"/api/v1/questions/{q_id}",
        json={
            "content": "Updated content with LaTeX $x^2 + y^2 = r^2$",
            "marks": 5.0,
            "options": [
                {"option_order": 1, "content": "A modified", "is_correct": False},
                {"option_order": 2, "content": "B modified", "is_correct": True},
            ],
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert "x^2 + y^2 = r^2" in updated["content"]
    assert updated["marks"] == 5.0
    correct = [o for o in updated["options"] if o["is_correct"]]
    assert correct[0]["content"] == "B modified"

    # 3. Archive question via DELETE
    del_resp = client.delete(f"/api/v1/questions/{q_id}")
    assert del_resp.status_code == 204

    # 4. Verify question is ARCHIVED (not physically deleted)
    get_resp = client.get(f"/api/v1/questions/{q_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "ARCHIVED"


def test_question_search_filter_pagination(client: TestClient, auth_headers, test_subject: Subject):
    # Insert multiple questions
    for i in range(5):
        client.post(
            "/api/v1/questions",
            json={
                "question_type": "NUMERICAL",
                "subject_id": str(test_subject.id),
                "difficulty": "EASY" if i % 2 == 0 else "HARD",
                "content": f"Physics problem number {i} with unique keyword Gravitation{i}",
                "numerical_answer": float(i),
            },
        )

    # Search keyword
    search_resp = client.get("/api/v1/questions?search=Gravitation2")
    assert search_resp.status_code == 200
    res = search_resp.json()
    assert res["total"] == 1
    assert "Gravitation2" in res["items"][0]["content"]

    # Filter by difficulty
    diff_resp = client.get("/api/v1/questions?difficulty=EASY")
    assert diff_resp.status_code == 200
    assert all(item["difficulty"] == "EASY" for item in diff_resp.json()["items"])

    # Pagination
    page_resp = client.get("/api/v1/questions?page=1&page_size=2")
    assert page_resp.status_code == 200
    page_data = page_resp.json()
    assert len(page_data["items"]) == 2
    assert page_data["page"] == 1
    assert page_data["page_size"] == 2
    assert page_data["total_pages"] >= 3


def test_unauthenticated_access_rejected(client: TestClient):
    # Clear any active cookies
    client.cookies.clear()
    resp = client.get("/api/v1/questions")
    assert resp.status_code == 401
