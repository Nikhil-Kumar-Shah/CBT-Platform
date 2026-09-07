import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.models.subject import Subject
from backend.app.models.test import Test
from backend.app.services.test_service import TestService
from backend.app.services.attempt_service import AttemptService


def test_create_faculty_account_and_login(client: TestClient, test_admin: User, auth_headers: dict):
    # 1. Admin creates a professor account
    resp = client.post(
        "/api/v1/auth/users",
        headers=auth_headers,
        json={
            "display_name": "Prof. Richard Feynman",
            "username": "rfeynman",
            "email": "feynman@caltech.edu",
            "password": "QuantumElectrodynamics123!",
            "role": "PROFESSOR",
        },
    )
    assert resp.status_code == 201, resp.text
    user_data = resp.json()
    assert user_data["username"] == "rfeynman"
    assert user_data["role"] == "PROFESSOR"
    assert user_data["status"] == "ACTIVE"
    assert "password" not in user_data
    assert "password_hash" not in user_data

    # 2. Professor logs in successfully
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "rfeynman",
            "password": "QuantumElectrodynamics123!",
        },
    )
    assert login_resp.status_code == 200, login_resp.text
    prof_token = login_resp.cookies[settings.SESSION_COOKIE_NAME]
    assert prof_token

    # 3. Professor can access /auth/me
    client.cookies.set(settings.SESSION_COOKIE_NAME, prof_token)
    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == "rfeynman"
    assert me_resp.json()["role"] == "PROFESSOR"

    # 4. Professor cannot create Admin accounts (SuperAdmin restriction)
    forbidden_resp = client.post(
        "/api/v1/auth/users",
        json={
            "display_name": "Rogue Admin",
            "username": "rogueadmin",
            "email": "rogue@admin.com",
            "password": "RogueAdminPass123!",
            "role": "ADMIN",
        },
    )
    assert forbidden_resp.status_code == 403


def test_password_change_flow(client: TestClient, test_admin: User, auth_headers: dict):
    # Create faculty user
    client.post(
        "/api/v1/auth/users",
        headers=auth_headers,
        json={
            "display_name": "Marie Curie",
            "username": "mcurie",
            "email": "curie@radium.org",
            "password": "OriginalRadioactivity123!",
            "role": "PROFESSOR",
        },
    )

    # Log in as mcurie
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "mcurie",
            "password": "OriginalRadioactivity123!",
        },
    )
    token = login_resp.cookies[settings.SESSION_COOKIE_NAME]
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)

    # Try changing password with wrong current password
    fail_resp = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "WrongPassword999!",
            "new_password": "NewRadioactivityPass456!",
        },
    )
    assert fail_resp.status_code == 400

    # Successfully change password
    success_resp = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "OriginalRadioactivity123!",
            "new_password": "NewRadioactivityPass456!",
        },
    )
    assert success_resp.status_code == 200

    # Verify login works with new password and fails with old
    bad_login = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "mcurie",
            "password": "OriginalRadioactivity123!",
        },
    )
    assert bad_login.status_code == 401

    good_login = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "mcurie",
            "password": "NewRadioactivityPass456!",
        },
    )
    assert good_login.status_code == 200


def test_subject_6character_code_enforcement(client: TestClient, auth_headers: dict):
    # Valid 6-character subject code (e.g. PHY001)
    valid_resp = client.post(
        "/api/v1/subjects",
        headers=auth_headers,
        json={
            "name": "Quantum Physics",
            "code": "PHY001",
        },
    )
    assert valid_resp.status_code == 201
    assert valid_resp.json()["code"] == "PHY001"

    # Invalid codes: hyphens, spaces, too short, too long
    for invalid_code in ["PHY-01", "PHY_01", "PHY", "PHYSICS101", "ABC 12"]:
        invalid_resp = client.post(
            "/api/v1/subjects",
            headers=auth_headers,
            json={
                "name": f"Subject {invalid_code}",
                "code": invalid_code,
            },
        )
        assert invalid_resp.status_code == 422


def test_subject_deletion_flow(client: TestClient, auth_headers: dict):
    # 1. Create a temporary subject
    create_resp = client.post(
        "/api/v1/subjects",
        headers=auth_headers,
        json={"name": "Obsolete Subject", "code": "OBS001"},
    )
    assert create_resp.status_code == 201
    subj_id = create_resp.json()["id"]

    # 2. Add topic to this subject
    top_resp = client.post(
        "/api/v1/topics",
        headers=auth_headers,
        json={"subject_id": subj_id, "name": "Chapter 1 Intro"},
    )
    assert top_resp.status_code == 201

    # 3. Delete subject permanently
    del_resp = client.delete(f"/api/v1/subjects/{subj_id}?permanent=true", headers=auth_headers)
    assert del_resp.status_code == 204

    # 4. Confirm subject is gone
    get_all = client.get("/api/v1/subjects", headers=auth_headers)
    assert get_all.status_code == 200
    ids = [s["id"] for s in get_all.json()]
    assert subj_id not in ids


def test_test_access_code_6character_generation_and_lookup(client: TestClient, auth_headers: dict, db_session: Session):
    # 1. Create subject with 6-char code
    subj_resp = client.post(
        "/api/v1/subjects",
        headers=auth_headers,
        json={"name": "Thermodynamics", "code": "THM001"},
    )
    subj_id = subj_resp.json()["id"]

    # 2. Create question in subject
    q_resp = client.post(
        "/api/v1/questions",
        headers=auth_headers,
        json={
            "subject_id": subj_id,
            "question_type": "MCQ",
            "content": "What is the first law of thermodynamics?",
            "difficulty": "EASY",
            "options": [
                {"content": "Conservation of energy", "is_correct": True, "option_order": 1},
                {"content": "Entropy increases", "is_correct": False, "option_order": 2},
            ],
        },
    )
    assert q_resp.status_code == 201
    q_id = q_resp.json()["id"]

    # 3. Create test paper without passing explicit code
    test_resp = client.post(
        "/api/v1/tests",
        headers=auth_headers,
        json={
            "title": "Thermodynamics Midterm Exam",
            "subject_id": subj_id,
            "duration_minutes": 60,
            "question_ids": [q_id],
        },
    )
    assert test_resp.status_code == 201
    test_data = test_resp.json()
    test_code = test_data["code"]
    test_id = test_data["id"]

    # Must be exactly 6 characters alphanumeric uppercase
    assert len(test_code) == 6
    assert test_code.isalnum()
    assert test_code == test_code.upper()
    assert "-" not in test_code

    # Publish test
    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish", headers=auth_headers)
    assert pub_resp.status_code == 200

    # 4. Student lookup with exactly 6-character code
    student_lookup = client.get(f"/api/v1/attempts/verify-code?code={test_code}")
    assert student_lookup.status_code == 200
    assert student_lookup.json()["code"] == test_code
    assert student_lookup.json()["title"] == "Thermodynamics Midterm Exam"

    # 5. Student lookup with lowercase input (auto-normalized by backend)
    student_lookup_lower = client.get(f"/api/v1/attempts/verify-code?code={test_code.lower()}")
    assert student_lookup_lower.status_code == 200
    assert student_lookup_lower.json()["code"] == test_code
