import uuid
import pytest
from starlette.testclient import TestClient
from sqlalchemy.orm import Session
from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.models.subject import Subject
from backend.app.models.question import Question


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
    uid = uuid.uuid4().hex[:6]
    subject = Subject(name=f"Physics_{uid}", code=f"PHY_{uid}", status="ACTIVE")
    db_session.add(subject)
    db_session.flush()
    return {"subject": subject}


def test_inline_question_creation_and_audit_log(client: TestClient, auth_headers, test_setup_data, db_session: Session):
    subject_id = str(test_setup_data["subject"].id)

    # 1. Create a draft test
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Optics Mastery Test",
            "subject_id": subject_id,
            "topics_covered": "Ray Optics, Refraction, Wave Optics",
            "duration_minutes": 45,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
        },
    )
    assert test_resp.status_code == 201
    test_data = test_resp.json()
    test_id = test_data["id"]
    assert test_data["status"] == "DRAFT"
    assert test_data["topics_covered"] == "Ray Optics, Refraction, Wave Optics"

    # 2. Add question inline directly into test
    inline_q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the speed of light in a vacuum?",
            "difficulty": "EASY",
            "marks": 4.0,
            "negative_marks": 1.0,
            "explanation": "Light travels at 3 x 10^8 m/s in vacuum.",
            "hint": "Think about fundamental constants of nature.",
            "options": [
                {"option_order": 1, "content": "3 x 10^8 m/s", "is_correct": True},
                {"option_order": 2, "content": "3 x 10^6 m/s", "is_correct": False},
                {"option_order": 3, "content": "3 x 10^10 m/s", "is_correct": False},
                {"option_order": 4, "content": "Infinite", "is_correct": False},
            ],
        },
    )
    assert inline_q_resp.status_code == 201
    updated_test = inline_q_resp.json()
    assert updated_test["question_count"] == 1
    assert len(updated_test["questions"]) == 1
    assert updated_test["questions"][0]["question"]["content"] == "What is the speed of light in a vacuum?"
    assert updated_test["questions"][0]["question"]["hint"] == "Think about fundamental constants of nature."

    # 3. Add numerical question inline
    num_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "NUMERICAL",
            "content": "Find the focal length in cm of a lens with power +2.5 D.",
            "difficulty": "MEDIUM",
            "marks": 4.0,
            "negative_marks": 0.0,
            "numerical_answer": 40.0,
            "numerical_tolerance": 0.5,
            "explanation": "f = 1/P = 1/2.5 m = 0.4 m = 40 cm.",
        },
    )
    assert num_resp.status_code == 201
    updated_test2 = num_resp.json()
    assert updated_test2["question_count"] == 2

    # 4. Check audit logs
    audit_resp = client.get(f"/api/v1/tests/{test_id}/audit-logs")
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert len(logs) >= 3  # TEST_CREATED, QUESTION_ADDED, QUESTION_ADDED
    actions = [l["action"] for l in logs]
    assert "TEST_CREATED" in actions
    assert "QUESTION_ADDED" in actions

    # 5. Publish test
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()
    assert pub_data["status"] == "LIVE"

    # 6. Verify LIVE test guard: destructive structural edits must be blocked!
    block_edit = client.put(
        f"/api/v1/tests/{test_id}/questions",
        json={"questions": []},
    )
    assert block_edit.status_code == 400
    assert "destructive structural changes" in block_edit.json()["detail"].lower() or "live" in block_edit.json()["detail"].lower()

    # 7. Check analytics endpoint returns valid data structure
    analytics_resp = client.get(f"/api/v1/tests/{test_id}/analytics")
    assert analytics_resp.status_code == 200
    analytics = analytics_resp.json()
    assert analytics["test_id"] == test_id
    assert analytics["test_title"] == "Optics Mastery Test"
    assert analytics["total_participants"] == 0
    assert len(analytics["score_distribution"]) == 5
    assert len(analytics["question_performance"]) == 2

    # 8. Add a real student attempt and verify analytics calculation & detail modal
    from backend.app.models.test_attempt import TestAttempt, TestAttemptAnswer
    att = TestAttempt(
        test_id=uuid.UUID(test_data["id"]),
        student_name="Rahul Verma",
        roll_number="NEET-2026-042",
        score=4.0,
        total_marks=8.0,
        percentage=50.0,
        correct_count=1,
        incorrect_count=1,
        unattempted_count=0,
        time_taken_seconds=1240,
        status="SUBMITTED",
    )
    db_session.add(att)
    db_session.flush()

    ans1 = TestAttemptAnswer(
        attempt_id=att.id,
        question_id=uuid.UUID(updated_test["questions"][0]["question"]["id"]),
        selected_option_ids="3 x 10^8 m/s",
        is_correct=True,
        marks_awarded=4.0,
    )
    ans2 = TestAttemptAnswer(
        attempt_id=att.id,
        question_id=uuid.UUID(updated_test2["questions"][1]["question"]["id"]),
        numerical_answer=25.0,
        is_correct=False,
        marks_awarded=0.0,
    )
    db_session.add_all([ans1, ans2])
    db_session.commit()

    # Re-check analytics with student attempt
    analytics2 = client.get(f"/api/v1/tests/{test_id}/analytics").json()
    assert analytics2["total_participants"] == 1
    assert analytics2["completed_submissions"] == 1
    assert analytics2["average_score"] == 4.0
    assert len(analytics2["student_submissions"]) == 1
    assert analytics2["student_submissions"][0]["student_name"] == "Rahul Verma"

    # Check student detail submission endpoint
    detail_resp = client.get(f"/api/v1/tests/attempts/{att.id}/detail")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["student_name"] == "Rahul Verma"
    assert len(detail["answers"]) == 2


def test_inline_question_editing_workflow(client: TestClient, auth_headers, test_setup_data, db_session: Session):
    subject_id = str(test_setup_data["subject"].id)

    # 1. Create a draft test
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Thermodynamics Quiz",
            "subject_id": subject_id,
            "duration_minutes": 30,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
        },
    )
    assert test_resp.status_code == 201
    test_id = test_resp.json()["id"]

    # 2. Add question inline
    q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "Initial Question Text",
            "difficulty": "EASY",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "Option A", "is_correct": True},
                {"option_order": 2, "content": "Option B", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201
    test_data = q_resp.json()
    question_id = test_data["questions"][0]["question"]["id"]

    # 3. Edit question inline
    edit_resp = client.put(
        f"/api/v1/tests/{test_id}/questions/{question_id}/inline",
        json={
            "question_type": "MCQ",
            "content": "Updated Question Text via Inline Editor",
            "difficulty": "HARD",
            "marks": 5.0,
            "negative_marks": 2.0,
            "explanation": "Updated explanation",
            "options": [
                {"option_order": 1, "content": "Updated Option A", "is_correct": False},
                {"option_order": 2, "content": "Updated Option B", "is_correct": True},
            ],
        },
    )
    assert edit_resp.status_code == 200
    updated_test = edit_resp.json()
    updated_q = updated_test["questions"][0]["question"]
    assert updated_q["content"] == "Updated Question Text via Inline Editor"
    assert updated_q["difficulty"] == "HARD"
    assert updated_q["marks"] == 5.0
    assert updated_q["negative_marks"] == 2.0
    assert updated_q["explanation"] == "Updated explanation"
    assert updated_q["options"][1]["is_correct"] is True

    # 4. Verify audit log entry
    audit_resp = client.get(f"/api/v1/tests/{test_id}/audit-logs")
    assert audit_resp.status_code == 200
    actions = [l["action"] for l in audit_resp.json()]
    assert "QUESTION_EDITED" in actions


def test_cbt_professional_question_types_workflow(client: TestClient, auth_headers, test_setup_data):
    subject_id = str(test_setup_data["subject"].id)

    # 1. Create a draft test
    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "NEET Comprehensive Types Test",
            "subject_id": subject_id,
            "duration_minutes": 60,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
        },
    )
    assert test_resp.status_code == 201
    test_id = test_resp.json()["id"]

    # 2. Add TRUE_FALSE question
    tf_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "TRUE_FALSE",
            "content": "A concave mirror can form a virtual image.",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "True", "is_correct": True},
                {"option_order": 2, "content": "False", "is_correct": False},
            ],
        },
    )
    assert tf_resp.status_code == 201
    assert tf_resp.json()["question_count"] == 1

    # 3. Add ASSERTION_REASON question
    ar_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "ASSERTION_REASON",
            "content": "Assertion (A): Sky appears blue. Reason (R): Rayleigh scattering depends inversely on 4th power of wavelength.",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "Both (A) and (R) are true and (R) is correct explanation", "is_correct": True},
                {"option_order": 2, "content": "Both (A) and (R) are true but (R) is not correct explanation", "is_correct": False},
                {"option_order": 3, "content": "(A) is true but (R) is false", "is_correct": False},
                {"option_order": 4, "content": "(A) is false but (R) is true", "is_correct": False},
            ],
        },
    )
    assert ar_resp.status_code == 201
    assert ar_resp.json()["question_count"] == 2

    # 4. Add MATCH_THE_FOLLOWING question
    match_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MATCH_THE_FOLLOWING",
            "content": "Match List-I with List-II: [P: Convex lens, Q: Concave lens] with [1: Diverging, 2: Converging]",
            "marks": 4.0,
            "negative_marks": 1.0,
            "options": [
                {"option_order": 1, "content": "P-2, Q-1", "is_correct": True},
                {"option_order": 2, "content": "P-1, Q-2", "is_correct": False},
            ],
        },
    )
    assert match_resp.status_code == 201
    assert match_resp.json()["question_count"] == 3

    # 5. Add FILL_BLANK question with custom per-question marks
    fill_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "FILL_BLANK",
            "content": "The speed of light in vacuum is ___ x 10^8 m/s.",
            "marks": 5.0,
            "negative_marks": 0.0,
            "numerical_answer": 3.0,
            "numerical_tolerance": 0.0,
        },
    )
    assert fill_resp.status_code == 201
    final_test = fill_resp.json()
    assert final_test["question_count"] == 4
    # Total marks: 4 + 4 + 4 + 5 = 17
    assert final_test["total_marks"] == 17.0


