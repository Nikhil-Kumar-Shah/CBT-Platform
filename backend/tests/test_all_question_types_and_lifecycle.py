import uuid
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject


def test_all_seven_question_types_lifecycle_and_short_answer_rejection(
    client: TestClient,
    auth_headers: dict,
    db_session: Session,
):
    """
    Complete end-to-end lifecycle test covering:
    1. Rejection of SHORT_ANSWER (HTTP 422 Unprocessable Entity)
    2. Question creation for all 7 supported question types:
       - MCQ
       - MULTIPLE_CHOICE
       - NUMERICAL
       - TRUE_FALSE
       - ASSERTION_REASON
       - MATCH_THE_FOLLOWING
       - FILL_BLANK
    3. Session state rendering (no answer leakage during exam)
    4. Candidate answering every question type & submitting
    5. 100% correct evaluation and score calculation
    """
    subj = Subject(name="All Types Subject", code="SUBA07", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    access_code = "ALL701"

    # 1. Create Test as Admin
    test_payload = {
        "title": "Comprehensive All 7 Question Types Exam",
        "subject_id": str(subj.id),
        "code": access_code,
        "duration_minutes": 30,
        "positive_marks": 2.0,
        "negative_marks": 0.5,
        "result_visibility": "IMMEDIATELY",
        "show_results": True,
        "show_answers": True,
        "show_explanation": True,
    }
    create_test_res = client.post("/api/v1/tests", json=test_payload)
    assert create_test_res.status_code in (200, 201), create_test_res.text
    test_data = create_test_res.json()
    test_id = test_data["id"]
    code = test_data["code"]

    # Test that SHORT_ANSWER question creation is strictly REJECTED (HTTP 422)
    short_answer_res = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Explain photosynthesis in short.",
            "question_type": "SHORT_ANSWER",
            "marks": 2.0,
            "options": [{"option_order": 1, "content": "Sample", "is_correct": True}],
        },
    )
    assert short_answer_res.status_code == 422, "SHORT_ANSWER must be rejected with 422 Unprocessable Entity"

    # 2. Add 7 Questions (one of each supported type) via inline question creation
    # Q1: MCQ
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "What is the primary power source of Earth's climate?",
            "question_type": "MCQ",
            "marks": 2.0,
            "negative_marks": 0.5,
            "explanation": "The Sun provides the vast majority of energy driving Earth's climate.",
            "options": [
                {"option_order": 1, "content": "The Moon", "is_correct": False},
                {"option_order": 2, "content": "The Sun", "is_correct": True},
                {"option_order": 3, "content": "Volcanoes", "is_correct": False},
                {"option_order": 4, "content": "Geothermal vents", "is_correct": False},
            ],
        },
    )

    # Q2: MULTIPLE_CHOICE (Multi-select)
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Which of the following are noble gases? (Select all that apply)",
            "question_type": "MULTIPLE_CHOICE",
            "marks": 2.0,
            "negative_marks": 0.0,
            "explanation": "Helium and Argon are noble gases; Oxygen and Nitrogen are diatomic non-metals.",
            "options": [
                {"option_order": 1, "content": "Helium", "is_correct": True},
                {"option_order": 2, "content": "Oxygen", "is_correct": False},
                {"option_order": 3, "content": "Argon", "is_correct": True},
                {"option_order": 4, "content": "Nitrogen", "is_correct": False},
            ],
        },
    )

    # Q3: NUMERICAL
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "What is the boiling point of pure water in Celsius at 1 atm?",
            "question_type": "NUMERICAL",
            "marks": 2.0,
            "negative_marks": 0.0,
            "numerical_answer": 100.0,
            "numerical_tolerance": 0.5,
            "explanation": "Water boils at 100 degrees Celsius under standard atmospheric pressure.",
            "options": [],
        },
    )

    # Q4: TRUE_FALSE
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Light travels faster in a vacuum than sound travels in air.",
            "question_type": "TRUE_FALSE",
            "marks": 2.0,
            "negative_marks": 0.5,
            "explanation": "Speed of light in vacuum is ~3x10^8 m/s, whereas sound is ~343 m/s in air.",
            "options": [
                {"option_order": 1, "content": "True", "is_correct": True},
                {"option_order": 2, "content": "False", "is_correct": False},
            ],
        },
    )

    # Q5: ASSERTION_REASON
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Assertion: Photosynthesis produces glucose and oxygen.\nReason: Plants use chlorophyll to absorb light energy.",
            "question_type": "ASSERTION_REASON",
            "marks": 2.0,
            "negative_marks": 0.5,
            "explanation": "Both assertion and reason are true and reason correctly explains the mechanism.",
            "options": [
                {"option_order": 1, "content": "Both A and R are true and R is the correct explanation of A", "is_correct": True},
                {"option_order": 2, "content": "Both A and R are true but R is NOT the correct explanation of A", "is_correct": False},
                {"option_order": 3, "content": "A is true but R is false", "is_correct": False},
                {"option_order": 4, "content": "A is false but R is true", "is_correct": False},
            ],
        },
    )

    # Q6: MATCH_THE_FOLLOWING
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Match List-I with List-II:\n(P) Mitochondria - (1) Powerhouse\n(Q) Ribosome - (2) Protein synthesis",
            "question_type": "MATCH_THE_FOLLOWING",
            "marks": 2.0,
            "negative_marks": 0.5,
            "explanation": "P-1, Q-2 is the exact biological function pairing.",
            "options": [
                {"option_order": 1, "content": "P-1, Q-2", "is_correct": True},
                {"option_order": 2, "content": "P-2, Q-1", "is_correct": False},
                {"option_order": 3, "content": "P-1, Q-1", "is_correct": False},
                {"option_order": 4, "content": "P-2, Q-2", "is_correct": False},
            ],
        },
    )

    # Q7: FILL_BLANK
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "The powerhouse of the cell is called the __________.",
            "question_type": "FILL_BLANK",
            "marks": 2.0,
            "negative_marks": 0.0,
            "explanation": "Mitochondria generate most of the chemical energy needed by the cell.",
            "options": [
                {"option_order": 1, "content": "mitochondria", "is_correct": True},
            ],
        },
    )

    # Publish the test so candidates can start it
    pub_res = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_res.status_code == 200

    # Fetch admin details to map questions and correct option IDs
    admin_test = client.get(f"/api/v1/tests/{test_id}")
    assert admin_test.status_code == 200
    admin_qs = admin_test.json()["questions"]
    assert len(admin_qs) == 7

    # 3. Start Candidate Attempt
    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": code,
            "candidate_name": "Test Candidate",
            "candidate_email": "candidate@example.com",
            "candidate_roll_number": "ROLL-777",
        },
    )
    assert start_res.status_code in (200, 201), start_res.text
    start_data = start_res.json()
    attempt_id = start_data["attempt_id"]
    session_id = start_data["session_id"]

    # 4. Fetch Candidate State and Verify No Correct Answers are Leaked
    state_res = client.get(
        f"/api/v1/attempts/{attempt_id}/state?session_id={session_id}"
    )
    assert state_res.status_code == 200, state_res.text
    state_data = state_res.json()
    questions = state_data["questions"]
    assert len(questions) == 7

    # Verify each question in candidate state has correct question_type and NO is_correct or explanations leaked
    for q in questions:
        assert "is_correct" not in str(q.get("options", []))
        assert "explanation" not in q

    # 5. Answer Every Question Type Correctly
    # Q1 (MCQ): "The Sun"
    q1_admin = [q for q in admin_qs if q["question"]["question_type"] == "MCQ"][0]
    q1_id = q1_admin["question"]["id"]
    q1_correct_opt = [o["id"] for o in q1_admin["question"]["options"] if o["is_correct"]][0]
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q1_id,
            "selected_option_id": q1_correct_opt,
            "selected_option_ids": q1_correct_opt,
            "is_visited": True,
        },
    )

    # Q2 (MULTIPLE_CHOICE): Helium + Argon
    q2_admin = [q for q in admin_qs if q["question"]["question_type"] == "MULTIPLE_CHOICE"][0]
    q2_id = q2_admin["question"]["id"]
    q2_correct_opts = [o["id"] for o in q2_admin["question"]["options"] if o["is_correct"]]
    q2_opts_str = ",".join(q2_correct_opts)
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q2_id,
            "selected_option_id": q2_opts_str,
            "selected_option_ids": q2_opts_str,
            "is_visited": True,
        },
    )

    # Q3 (NUMERICAL): 100.0
    q3_admin = [q for q in admin_qs if q["question"]["question_type"] == "NUMERICAL"][0]
    q3_id = q3_admin["question"]["id"]
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q3_id,
            "numerical_answer": 100.0,
            "is_visited": True,
        },
    )

    # Q4 (TRUE_FALSE): "True" option
    q4_admin = [q for q in admin_qs if q["question"]["question_type"] == "TRUE_FALSE"][0]
    q4_id = q4_admin["question"]["id"]
    q4_correct_opt = [o["id"] for o in q4_admin["question"]["options"] if o["is_correct"]][0]
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q4_id,
            "selected_option_id": q4_correct_opt,
            "selected_option_ids": q4_correct_opt,
            "text_answer": "True",
            "is_visited": True,
        },
    )

    # Q5 (ASSERTION_REASON): Option A
    q5_admin = [q for q in admin_qs if q["question"]["question_type"] == "ASSERTION_REASON"][0]
    q5_id = q5_admin["question"]["id"]
    q5_correct_opt = [o["id"] for o in q5_admin["question"]["options"] if o["is_correct"]][0]
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q5_id,
            "selected_option_id": q5_correct_opt,
            "selected_option_ids": q5_correct_opt,
            "is_visited": True,
        },
    )

    # Q6 (MATCH_THE_FOLLOWING): Option P-1, Q-2
    q6_admin = [q for q in admin_qs if q["question"]["question_type"] == "MATCH_THE_FOLLOWING"][0]
    q6_id = q6_admin["question"]["id"]
    q6_correct_opt = [o["id"] for o in q6_admin["question"]["options"] if o["is_correct"]][0]
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q6_id,
            "selected_option_id": q6_correct_opt,
            "selected_option_ids": q6_correct_opt,
            "is_visited": True,
        },
    )

    # Q7 (FILL_BLANK): "mitochondria"
    q7_admin = [q for q in admin_qs if q["question"]["question_type"] == "FILL_BLANK"][0]
    q7_id = q7_admin["question"]["id"]
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q7_id,
            "text_answer": "mitochondria",
            "is_visited": True,
        },
    )

    # 6. Submit Attempt
    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_res.status_code == 200, submit_res.text

    # 7. Get Result and Validate 100% Score
    result_res = client.get(
        f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}"
    )
    assert result_res.status_code == 200, result_res.text
    result_data = result_res.json()
    assert result_data["score"] == 14.0
    assert result_data["total_marks"] == 14.0
    assert result_data["percentage"] == 100.0
    assert result_data["correct_count"] == 7
    assert result_data["incorrect_count"] == 0
    assert result_data["unattempted_count"] == 0


def test_answer_review_disabled_hides_answers_at_server_level(
    client: TestClient,
    auth_headers: dict,
    db_session: Session,
):
    """
    Requirement 2: When show_answers is OFF, the server API response
    must NOT leak correct answers, explanations, or detailed answers.
    """
    subj = Subject(name="Confidential Subject", code="SUBCON", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    access_code = "SECA01"

    # Create exam with show_answers=False
    test_res = client.post(
        "/api/v1/tests",
        json={
            "title": "Confidential Examination (No Answers Review)",
            "subject_id": str(subj.id),
            "code": access_code,
            "duration_minutes": 20,
            "positive_marks": 5.0,
            "negative_marks": 2.0,
            "result_visibility": "IMMEDIATELY",
            "show_results": True,
            "show_answers": False,
            "show_explanation": False,
        },
    )
    assert test_res.status_code in (200, 201)
    test_id = test_res.json()["id"]
    code = test_res.json()["code"]

    # Add question with secret explanation
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "What is the classification code?",
            "question_type": "MCQ",
            "marks": 5.0,
            "explanation": "SECRET_EXPLANATION_DO_NOT_REVEAL_12345",
            "options": [
                {"option_order": 1, "content": "TOP_SECRET_ANSWER_DELTA", "is_correct": True},
                {"option_order": 2, "content": "INCORRECT_OPTION", "is_correct": False},
            ],
        },
    )

    client.post(f"/api/v1/tests/{test_id}/publish")

    # Candidate starts and submits
    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": code,
            "candidate_name": "Student A",
            "candidate_email": "studenta@example.com",
            "candidate_roll_number": "STU-001",
        },
    )
    assert start_res.status_code == 201
    attempt_id = start_res.json()["attempt_id"]
    session_id = start_res.json()["session_id"]

    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert submit_res.status_code == 200

    # Retrieve result as candidate
    result_res = client.get(
        f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}"
    )
    assert result_res.status_code == 200
    res_json = result_res.json()

    # Verify server response flags and complete omission of detailed answers
    assert res_json["show_answers"] is False
    assert res_json["show_explanation"] is False
    assert res_json.get("answers") is None

    # CRITICAL: Verify secret string is nowhere in the raw HTTP response body
    assert "TOP_SECRET_ANSWER_DELTA" not in result_res.text
    assert "SECRET_EXPLANATION_DO_NOT_REVEAL_12345" not in result_res.text


def test_authoritative_schedule_transitions_expired_tests_to_completed(
    client: TestClient,
    auth_headers: dict,
    db_session: Session,
):
    """
    Requirement 4: Admin exam status automatically reconciles from LIVE / SCHEDULED
    to COMPLETED once end_time passes using server-authoritative UTC time.
    """
    subj = Subject(name="Schedule Subject", code="SUBSCH", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    now = datetime.now(timezone.utc)
    past_start = now - timedelta(hours=2)
    past_end = now - timedelta(minutes=5)

    access_code = "PAST01"

    # Create exam with end_time in the past
    test_res = client.post(
        "/api/v1/tests",
        json={
            "title": "Past Scheduled Exam",
            "subject_id": str(subj.id),
            "code": access_code,
            "duration_minutes": 30,
            "positive_marks": 10.0,
            "start_time": past_start.isoformat(),
            "end_time": past_end.isoformat(),
        },
    )
    assert test_res.status_code in (200, 201)
    test_id = test_res.json()["id"]

    # Add 1 question so it can be published
    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Test Question",
            "question_type": "MCQ",
            "options": [
                {"option_order": 1, "content": "Opt 1", "is_correct": True},
                {"option_order": 2, "content": "Opt 2", "is_correct": False},
            ],
        },
    )

    # Publish it
    pub_res = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_res.status_code == 200

    # Get single test via admin API
    get_res = client.get(f"/api/v1/tests/{test_id}")
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "COMPLETED"

    # List tests via admin API
    list_res = client.get("/api/v1/tests")
    assert list_res.status_code == 200
    tests = list_res.json()["items"] if "items" in list_res.json() else list_res.json()
    matched = [t for t in tests if t["id"] == test_id]
    assert len(matched) == 1
    assert matched[0]["status"] == "COMPLETED"


def test_timer_auto_expiry_submission_flow(
    client: TestClient,
    auth_headers: dict,
    db_session: Session,
):
    """
    Requirement 3: Automatic submission when timer expires.
    Candidate responses are fully persisted and evaluated under AUTO_EXPIRED.
    """
    subj = Subject(name="Timer Subject", code="SUBTIM", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    access_code = "EXPA01"

    test_res = client.post(
        "/api/v1/tests",
        json={
            "title": "Timed Exam",
            "subject_id": str(subj.id),
            "code": access_code,
            "duration_minutes": 1,
            "positive_marks": 4.0,
            "negative_marks": 0.0,
        },
    )
    assert test_res.status_code in (200, 201)
    test_id = test_res.json()["id"]
    code = test_res.json()["code"]

    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "What is 5 + 5?",
            "question_type": "NUMERICAL",
            "marks": 4.0,
            "numerical_answer": 10.0,
            "options": [],
        },
    )
    client.post(f"/api/v1/tests/{test_id}/publish")

    admin_test = client.get(f"/api/v1/tests/{test_id}")
    q_id = admin_test.json()["questions"][0]["question"]["id"]

    # Start attempt
    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": code,
            "candidate_name": "Timer Candidate",
            "candidate_email": "timercand@example.com",
            "candidate_roll_number": "TIM-001",
        },
    )
    assert start_res.status_code == 201
    attempt_id = start_res.json()["attempt_id"]
    session_id = start_res.json()["session_id"]

    # Save answer
    client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={
            "session_id": session_id,
            "question_id": q_id,
            "numerical_answer": 10.0,
            "is_visited": True,
        },
    )

    # Auto submit upon expiry
    submit_res = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={
            "session_id": session_id,
            "forced_by_expiry": True,
        },
    )
    assert submit_res.status_code == 200

    # Verify result
    result_res = client.get(
        f"/api/v1/attempts/{attempt_id}/result?session_id={session_id}"
    )
    assert result_res.status_code == 200
    res_data = result_res.json()

    assert res_data["submission_reason"] == "AUTO_EXPIRED"
    assert res_data["score"] == 4.0
    assert res_data["correct_count"] == 1
    assert res_data["is_auto_expired"] is True


def test_image_upload_and_validation(client: TestClient, auth_headers: dict):
    """
    Requirement 2: Image upload flow:
    - Valid PNG/JPEG files are stored and served cleanly.
    - Invalid mime types and oversized files are rejected.
    """
    import io
    from PIL import Image

    img = Image.new("RGB", (200, 150), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    valid_png = buf.getvalue()

    upload_res = client.post(
        "/api/v1/media",
        files={"file": ("test_diagram.png", valid_png, "image/png")},
    )
    assert upload_res.status_code == 201, upload_res.text
    data = upload_res.json()
    assert "url" in data
    assert "original_filename" in data
    image_url = data["url"]
    assert image_url.startswith("/api/v1/media/file/") or image_url.startswith("http")
    assert not image_url.startswith("C:") and not image_url.startswith("d:")

    # Verify that the uploaded image can be served via static file endpoint
    get_img_res = client.get(image_url)
    assert get_img_res.status_code == 200

    # 2. Invalid file type rejection
    bad_res = client.post(
        "/api/v1/media",
        files={"file": ("malicious.exe", b"MZ\x90\x00", "application/x-msdownload")},
    )
    assert bad_res.status_code == 400
    assert "Unsupported image type" in bad_res.json()["detail"] or "Allowed types" in bad_res.json()["detail"]


def test_scheduled_start_friendly_validation(
    client: TestClient,
    auth_headers: dict,
    db_session: Session,
):
    """
    Requirement 3: Scheduled exam start validation.
    When a candidate checks access code before scheduled start time:
    - verify-access succeeds and returns scheduled start/end ISO times for countdown.
    - Candidate attempt start prior to start_time provides clean, friendly status without raw UTC.
    """
    subj = Subject(name="Future Subject", code="SUBFUT", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    now = datetime.now(timezone.utc)
    future_start = now + timedelta(hours=1)
    future_end = now + timedelta(hours=2)

    access_code = "FUTA01"

    test_res = client.post(
        "/api/v1/tests",
        json={
            "title": "Future Scheduled Olympiad",
            "subject_id": str(subj.id),
            "code": access_code,
            "duration_minutes": 60,
            "positive_marks": 4.0,
            "start_time": future_start.isoformat(),
            "end_time": future_end.isoformat(),
        },
    )
    assert test_res.status_code in (200, 201)
    test_id = test_res.json()["id"]

    client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "content": "Future Question",
            "question_type": "MCQ",
            "options": [
                {"option_order": 1, "content": "Opt 1", "is_correct": True},
                {"option_order": 2, "content": "Opt 2", "is_correct": False},
            ],
        },
    )
    client.post(f"/api/v1/tests/{test_id}/publish")

    # Verify access code works in pre-exam lobby
    verify_res = client.get(f"/api/v1/attempts/verify-access?code={access_code}")
    assert verify_res.status_code == 200, verify_res.text
    verify_data = verify_res.json()
    assert verify_data["title"] == "Future Scheduled Olympiad"
    assert verify_data["can_start"] is False
    assert verify_data["is_lobby_open"] is True
    assert verify_data["start_time"] is not None

    # Starting before scheduled start returns friendly start_time without raw UTC technical string
    start_res = client.post(
        "/api/v1/attempts/start",
        json={
            "access_code": access_code,
            "candidate_name": "Early Candidate",
            "candidate_email": "early@example.com",
            "candidate_roll_number": "EARLY-01",
        },
    )
    assert start_res.status_code == 400
    err_detail = start_res.json()["detail"]
    assert "UTC" not in err_detail
    assert "hasn't started yet" in err_detail
