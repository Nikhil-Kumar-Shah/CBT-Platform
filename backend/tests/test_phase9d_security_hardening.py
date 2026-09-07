import io
import uuid
from datetime import datetime, timezone
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.models.user import User
from backend.app.models.subject import Subject
from backend.app.models.question import Question
from backend.app.models.question_option import QuestionOption
from backend.app.models.test import Test
from backend.app.models.test_question import TestQuestion
from backend.app.core.config import settings
from backend.app.core.rate_limit import access_code_tracker


@pytest.fixture
def auth_admin(client: TestClient, test_admin: User):
    resp = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": test_admin.username, "password": "SecretAdminPass123!"},
    )
    assert resp.status_code == 200
    token = resp.cookies[settings.SESSION_COOKIE_NAME]
    return {"user": test_admin, "token": token}


@pytest.fixture
def published_security_test(db_session, auth_admin):
    subj = Subject(name="Security Engineering", code="SEC-001", status="ACTIVE")
    db_session.add(subj)
    db_session.flush()

    q1 = Question(
        subject_id=subj.id,
        question_type="MCQ",
        content="What is the primary defense against IDOR?",
        marks=4.0,
        negative_marks=1.0,
        status="ACTIVE",
        created_by=auth_admin["user"].id,
    )
    db_session.add(q1)
    db_session.flush()

    opt1 = QuestionOption(question_id=q1.id, content="Server-side authorization checks", is_correct=True, option_order=1)
    opt2 = QuestionOption(question_id=q1.id, content="Hiding URLs on the frontend", is_correct=False, option_order=2)
    db_session.add_all([opt1, opt2])
    db_session.flush()

    foreign_q = Question(
        subject_id=subj.id,
        question_type="MCQ",
        content="This question belongs to a completely different exam",
        marks=2.0,
        negative_marks=0.0,
        status="ACTIVE",
        created_by=auth_admin["user"].id,
    )
    db_session.add(foreign_q)
    db_session.flush()

    test = Test(
        title="Security Assessment Paper",
        code="SEC-MOCK-2026",
        subject_id=subj.id,
        duration_minutes=30,
        positive_marks=4.0,
        negative_marks=1.0,
        status="PUBLISHED",
        result_visibility="IMMEDIATELY",
        show_answers=True,
        show_explanation=True,
        created_by=auth_admin["user"].id,
    )
    db_session.add(test)
    db_session.flush()

    tq = TestQuestion(test_id=test.id, question_id=q1.id, order_index=1, marks=4.0, negative_marks=1.0)
    db_session.add(tq)
    db_session.commit()
    db_session.refresh(test)

    return {
        "test": test,
        "q1": q1,
        "opt1": opt1,
        "opt2": opt2,
        "foreign_q": foreign_q,
    }


def test_production_security_headers(client: TestClient):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    headers = resp.headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "SAMEORIGIN"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in headers.get("content-security-policy", "")
    assert headers.get("x-permitted-cross-domain-policies") == "none"


def test_bearer_token_authentication(client: TestClient, auth_admin):
    # Clear cookies so client is not using cookie auth
    client.cookies.clear()

    # 1. Without credentials -> 401
    res_no_auth = client.get("/api/v1/tests")
    assert res_no_auth.status_code == 401

    # 2. With invalid Bearer token -> 401
    res_invalid_bearer = client.get("/api/v1/tests", headers={"Authorization": "Bearer invalid_token_xyz"})
    assert res_invalid_bearer.status_code == 401

    # 3. With valid Bearer token -> 200
    res_valid_bearer = client.get("/api/v1/tests", headers={"Authorization": f"Bearer {auth_admin['token']}"})
    assert res_valid_bearer.status_code == 200


def test_idor_attempt_state_isolation(client: TestClient, published_security_test, auth_admin):
    # Clear admin cookie so requests are anonymous candidate requests
    client.cookies.clear()

    # Start Candidate A attempt
    resp_a = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": published_security_test["test"].code,
            "candidate_name": "Alice Candidate",
            "candidate_email": "alice@security.com",
        },
    )
    assert resp_a.status_code == 201
    att_a = resp_a.json()
    att_id_a = att_a["attempt_id"]
    session_a = att_a["session_id"]

    # Start Candidate B attempt
    resp_b = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": published_security_test["test"].code,
            "candidate_name": "Bob Candidate",
            "candidate_email": "bob@security.com",
        },
    )
    assert resp_b.status_code == 201
    att_b = resp_b.json()
    att_id_b = att_b["attempt_id"]
    session_b = att_b["session_id"]

    # IDOR Attempt 1: Candidate A tries to access Candidate B's state using session_a -> 403
    idor_query = client.get(f"/api/v1/attempts/{att_id_b}?session_id={session_a}")
    assert idor_query.status_code == 403

    # IDOR Attempt 2: Candidate A tries to access Candidate B's state via X-Session-ID header -> 403
    idor_header = client.get(f"/api/v1/attempts/{att_id_b}", headers={"X-Session-ID": session_a})
    assert idor_header.status_code == 403

    # IDOR Attempt 3: Anonymous caller with no session_id -> 403
    anon_resp = client.get(f"/api/v1/attempts/{att_id_b}")
    assert anon_resp.status_code == 403

    # Legitimate candidate B access -> 200
    legit_resp = client.get(f"/api/v1/attempts/{att_id_b}?session_id={session_b}")
    assert legit_resp.status_code == 200

    # Admin inspection with Bearer -> 200
    admin_resp = client.get(
        f"/api/v1/attempts/{att_id_b}",
        headers={"Authorization": f"Bearer {auth_admin['token']}"},
    )
    assert admin_resp.status_code == 200


def test_idor_result_access_isolation(client: TestClient, published_security_test, auth_admin):
    client.cookies.clear()

    # Start and submit Candidate B attempt
    resp_b = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": published_security_test["test"].code,
            "candidate_name": "Bob Submitter",
            "candidate_email": "bob.sub@security.com",
        },
    )
    att_b = resp_b.json()
    att_id_b = att_b["attempt_id"]
    session_b = att_b["session_id"]

    # Submit Bob's attempt
    sub_resp = client.post(f"/api/v1/attempts/{att_id_b}/submit", json={"session_id": session_b})
    assert sub_resp.status_code == 200

    # Candidate A starts their own attempt
    resp_a = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": published_security_test["test"].code,
            "candidate_name": "Alice Snooper",
            "candidate_email": "alice.snoop@security.com",
        },
    )
    session_a = resp_a.json()["session_id"]

    # IDOR on result: Candidate A querying Candidate B's result -> 403
    res_idor = client.get(f"/api/v1/attempts/{att_id_b}/result?session_id={session_a}")
    assert res_idor.status_code == 403

    # IDOR on result: Anonymous user querying Candidate B's result without session -> 403
    res_anon = client.get(f"/api/v1/attempts/{att_id_b}/result")
    assert res_anon.status_code == 403

    # Legitimate access by Bob -> 200
    res_legit = client.get(f"/api/v1/attempts/{att_id_b}/result?session_id={session_b}")
    assert res_legit.status_code == 200

    # Admin inspection of Bob's result -> 200
    res_admin = client.get(
        f"/api/v1/attempts/{att_id_b}/result",
        headers={"Authorization": f"Bearer {auth_admin['token']}"},
    )
    assert res_admin.status_code == 200


def test_answer_tampering_and_question_ownership(client: TestClient, published_security_test):
    client.cookies.clear()

    # Start candidate attempt
    resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": published_security_test["test"].code,
            "candidate_name": "Charlie Attacker",
            "candidate_email": "charlie@security.com",
        },
    )
    att = resp.json()
    att_id = att["attempt_id"]
    session_id = att["session_id"]
    q1_id = published_security_test["q1"].id
    opt1_id = published_security_test["opt1"].id
    foreign_q_id = published_security_test["foreign_q"].id

    # 1. Attempt to save answer with invalid/mismatched session_id -> 403
    res_bad_sess = client.post(
        f"/api/v1/attempts/{att_id}/answer",
        json={
            "session_id": "forged_session_xyz_123",
            "question_id": str(q1_id),
            "selected_option_ids": str(opt1_id),
        },
    )
    assert res_bad_sess.status_code == 403

    # 2. Attempt to save answer for foreign question not in this exam paper -> 400
    res_foreign_q = client.post(
        f"/api/v1/attempts/{att_id}/answer",
        json={
            "session_id": session_id,
            "question_id": str(foreign_q_id),
            "selected_option_ids": "some_option_id",
        },
    )
    assert res_foreign_q.status_code == 400
    assert "does not belong" in res_foreign_q.json()["detail"].lower()

    # 3. Attempt to save answer referencing forged/invalid option ID -> 400
    fake_opt_id = str(uuid.uuid4())
    res_fake_opt = client.post(
        f"/api/v1/attempts/{att_id}/answer",
        json={
            "session_id": session_id,
            "question_id": str(q1_id),
            "selected_option_ids": fake_opt_id,
        },
    )
    assert res_fake_opt.status_code == 400
    assert "does not belong" in res_fake_opt.json()["detail"].lower()

    # 4. Legitimate answer save -> 200
    res_legit = client.post(
        f"/api/v1/attempts/{att_id}/answer",
        json={
            "session_id": session_id,
            "question_id": str(q1_id),
            "selected_option_ids": str(opt1_id),
        },
    )
    assert res_legit.status_code == 200

    # 5. Submit attempt
    sub_resp = client.post(f"/api/v1/attempts/{att_id}/submit", json={"session_id": session_id})
    assert sub_resp.status_code == 200

    # 6. Attempt to modify answer AFTER submission -> 400
    res_post_sub = client.post(
        f"/api/v1/attempts/{att_id}/answer",
        json={
            "session_id": session_id,
            "question_id": str(q1_id),
            "selected_option_ids": str(opt1_id),
        },
    )
    assert res_post_sub.status_code == 400
    assert "completed" in res_post_sub.json()["detail"].lower() or "submitted" in res_post_sub.json()["detail"].lower()


def test_integrity_event_forgery_protection(client: TestClient, published_security_test):
    client.cookies.clear()

    # Start Candidate Attempt
    resp = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": published_security_test["test"].code,
            "candidate_name": "Dave Integrity",
            "candidate_email": "dave@security.com",
        },
    )
    att = resp.json()
    att_id = att["attempt_id"]
    session_id = att["session_id"]

    # 1. Attacker attempts to post integrity events with wrong session ID -> 403
    bad_post = client.post(
        f"/api/v1/attempts/{att_id}/integrity-events?session_id=forged_session",
        json={"events": [{"event_type": "TAB_SWITCHED"}]},
    )
    assert bad_post.status_code == 403

    # 2. Legitimate event post with matching session ID -> 200
    good_post = client.post(
        f"/api/v1/attempts/{att_id}/integrity-events?session_id={session_id}",
        json={"events": [{"event_type": "TAB_SWITCHED"}]},
    )
    assert good_post.status_code == 200


def test_access_code_failed_attempt_throttler(client: TestClient, published_security_test):
    access_code_tracker.reset()

    fake_ip = "192.168.1.99"
    # Simulate 10 failed access code attempts from fake_ip
    for _ in range(10):
        res = client.post(
            "/api/v1/attempts/verify-code",
            json={"access_code": "NON-EXISTENT-CODE-999"},
            headers={"X-Forwarded-For": fake_ip},
        )
        assert res.status_code in (400, 404, 429)

    # The 11th request from that IP must be throttled with 429
    throttled_res = client.post(
        "/api/v1/attempts/verify-code",
        json={"access_code": published_security_test["test"].code},
        headers={"X-Forwarded-For": fake_ip},
    )
    assert throttled_res.status_code == 429
    assert "Too many failed access code attempts" in throttled_res.json()["detail"]
    assert "Retry-After" in throttled_res.headers

    # A different legitimate IP is NOT throttled
    diff_ip = "192.168.1.100"
    legit_res = client.post(
        "/api/v1/attempts/verify-code",
        json={"access_code": published_security_test["test"].code},
        headers={"X-Forwarded-For": diff_ip},
    )
    assert legit_res.status_code == 200

    access_code_tracker.reset()


def test_media_upload_filename_sanitization(client: TestClient, auth_admin):
    # Create a valid minimal PNG
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color="blue")
    img.save(buf, format="PNG")
    buf.seek(0)

    # Upload with malicious path-traversal filename
    malicious_filename = "../../../etc/passwd.png"
    resp = client.post(
        "/api/v1/media",
        files={"file": (malicious_filename, buf.getvalue(), "image/png")},
        headers={"Authorization": f"Bearer {auth_admin['token']}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    # Ensure path traversal was stripped from original_filename
    assert ".." not in data["original_filename"]
    assert "/" not in data["original_filename"]
    assert "\\" not in data["original_filename"]
    # Storage key is a random UUID
    assert data["storage_key"].startswith("questions/")
    assert "passwd" not in data["storage_key"]
