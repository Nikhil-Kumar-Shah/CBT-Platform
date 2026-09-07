import uuid
import json
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models.subject import Subject
from backend.app.models.attempt_integrity_event import AttemptIntegrityEvent
from backend.app.services.integrity_service import IntegrityService


def create_sample_exam(client: TestClient, db_session: Session, auth_headers: dict) -> dict:
    subj = Subject(name=f"Integrity {uuid.uuid4().hex[:4]}", code=f"INT-{uuid.uuid4().hex[:4].upper()}", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    test_resp = client.post(
        "/api/v1/tests",
        json={
            "title": "Integrity Verification Exam",
            "subject_id": str(subj.id),
            "duration_minutes": 30,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
            "result_visibility": "IMMEDIATELY",
            "show_answers": True,
            "show_explanation": True,
            "allow_resume": True,
        },
    )
    assert test_resp.status_code == 201, test_resp.text
    test_data = test_resp.json()
    test_id = test_data["id"]
    code = test_data["code"]

    q_resp = client.post(
        f"/api/v1/tests/{test_id}/questions/inline",
        json={
            "question_type": "MCQ",
            "content": "What is the integrity baseline?",
            "marks": 4.0,
            "negative_marks": 1.0,
            "explanation": "Resilient append-only audit logs",
            "options": [
                {"option_order": 1, "content": "Resilient logging", "is_correct": True},
                {"option_order": 2, "content": "Data destruction", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201, q_resp.text

    pub_resp = client.post(f"/api/v1/tests/{test_id}/publish")
    assert pub_resp.status_code == 200, pub_resp.text

    return {"test_id": test_id, "code": code}


def test_record_integrity_events_batch(client: TestClient, db_session: Session, auth_headers: dict):
    exam = create_sample_exam(client, db_session, auth_headers)
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": exam["code"], "candidate_name": "Alice Integrity", "roll_number": "ROLL-101"},
    )
    assert start_resp.status_code in (200, 201), start_resp.text
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]

    # Post batch integrity events
    payload = {
        "events": [
            {
                "event_type": "fullscreen_exited",
                "client_timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": 12.5,
                "metadata_json": '{"reason": "esc_key"}',
                "session_id": session_id,
            },
            {
                "event_type": "tab_switched",
                "client_timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": 4.0,
                "session_id": session_id,
            },
        ]
    }
    ev_resp = client.post(f"/api/v1/attempts/{attempt_id}/integrity-events", json=payload)
    assert ev_resp.status_code == 200, ev_resp.text
    events_data = ev_resp.json()
    assert len(events_data) == 2
    assert events_data[0]["event_type"] == "FULLSCREEN_EXITED"
    assert events_data[0]["duration_seconds"] == 12.5
    assert events_data[1]["event_type"] == "TAB_SWITCHED"
    assert events_data[1]["attempt_id"] == attempt_id

    # Verify directly in DB
    db_events = db_session.query(AttemptIntegrityEvent).filter_by(attempt_id=attempt_id).all()
    assert len(db_events) == 2
    assert db_events[0].session_id == session_id


def test_integrity_summary_and_admin_review(
    client: TestClient, db_session: Session, auth_headers: dict
):
    exam = create_sample_exam(client, db_session, auth_headers)
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": exam["code"], "candidate_name": "Bob Integrity", "roll_number": "ROLL-102"},
    )
    assert start_resp.status_code in (200, 201), start_resp.text
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]

    # Ingest multiple events triggering review recommendation
    payload = {
        "events": [
            {"event_type": "TAB_SWITCHED", "duration_seconds": 2.0},
            {"event_type": "TAB_SWITCHED", "duration_seconds": 3.0},
            {"event_type": "TAB_SWITCHED", "duration_seconds": 1.5},
            {"event_type": "MULTIPLE_TAB_DETECTED", "metadata_json": '{"channel": "ping_reply"}'},
            {"event_type": "INACTIVITY_ENDED", "duration_seconds": 75.0},
            {"event_type": "NETWORK_DISCONNECTED", "duration_seconds": 5.0},
            {"event_type": "PAGE_REFRESHED"},
        ]
    }
    client.post(f"/api/v1/attempts/{attempt_id}/integrity-events", json=payload)

    # Fetch summary via admin endpoint
    summary_resp = client.get(f"/api/v1/attempts/{attempt_id}/integrity")
    assert summary_resp.status_code == 200, summary_resp.text
    summary = summary_resp.json()

    assert summary["attempt_id"] == attempt_id
    assert summary["total_events"] == 7
    assert summary["tab_switches"] == 3
    assert summary["multiple_tab_detections"] == 1
    assert summary["network_interruptions"] == 1
    assert summary["refresh_count"] == 1
    assert summary["total_inactive_seconds"] == 75.0
    assert summary["review_recommended"] is True
    assert len(summary["review_reasons"]) >= 2
    assert any("concurrent tab" in r for r in summary["review_reasons"])
    assert any("window/tab" in r for r in summary["review_reasons"])
    assert len(summary["events"]) == 7


def test_security_append_only_and_isolation(client: TestClient, db_session: Session, auth_headers: dict):
    exam = create_sample_exam(client, db_session, auth_headers)
    # Start two different attempts
    resp1 = client.post(
        "/api/v1/attempts/start",
        json={"access_code": exam["code"], "candidate_name": "Student A", "roll_number": "A01"},
    )
    resp2 = client.post(
        "/api/v1/attempts/start",
        json={"access_code": exam["code"], "candidate_name": "Student B", "roll_number": "B01"},
    )
    att_a = resp1.json()["attempt_id"]
    att_b = resp2.json()["attempt_id"]

    # Record event for Student A
    client.post(
        f"/api/v1/attempts/{att_a}/integrity-events",
        json={"events": [{"event_type": "TAB_SWITCHED"}]},
    )

    # Query internal service for B -> should be 0 events
    summary_b = IntegrityService.get_attempt_integrity_summary(db_session, uuid.UUID(att_b))
    assert summary_b.total_events == 0
    assert summary_b.tab_switches == 0

    # Non-existent attempt event posting -> 404
    fake_id = str(uuid.uuid4())
    bad_resp = client.post(
        f"/api/v1/attempts/{fake_id}/integrity-events",
        json={"events": [{"event_type": "TAB_SWITCHED"}]},
    )
    assert bad_resp.status_code == 404


def test_exam_lifecycle_unaffected_by_integrity_events(
    client: TestClient, db_session: Session, auth_headers: dict
):
    exam = create_sample_exam(client, db_session, auth_headers)
    start_resp = client.post(
        "/api/v1/attempts/start",
        json={"access_code": exam["code"], "candidate_name": "Charlie Flow", "roll_number": "CF-100"},
    )
    attempt_id = start_resp.json()["attempt_id"]
    session_id = start_resp.json()["session_id"]
    questions = start_resp.json()["questions"]
    q1 = questions[0]
    chosen_opt = q1["options"][0]

    # 1. Candidate logs an integrity event (e.g. fullscreen exit)
    ev_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/integrity-events",
        json={"events": [{"event_type": "FULLSCREEN_EXITED", "session_id": session_id}]},
    )
    assert ev_resp.status_code == 200

    # 2. Candidate saves an answer - guaranteed unaffected!
    ans_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/answer",
        json={
            "session_id": session_id,
            "question_id": q1["id"],
            "selected_option_ids": json.dumps([str(chosen_opt["id"])]),
            "is_marked_for_review": False,
        },
    )
    assert ans_resp.status_code == 200
    assert ans_resp.json()["status"].upper() == "SAVED"

    # 3. Candidate heartbeats
    hb_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/heartbeat",
        json={"session_id": session_id},
    )
    assert hb_resp.status_code == 200

    # 4. Another integrity event (tab switch)
    client.post(
        f"/api/v1/attempts/{attempt_id}/integrity-events",
        json={"events": [{"event_type": "TAB_SWITCHED"}]},
    )

    # 5. Submit attempt
    sub_resp = client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        json={"session_id": session_id},
    )
    assert sub_resp.status_code == 200
    result_data = sub_resp.json()
    assert result_data["status"] == "COMPLETED"

    # 6. Verify analytics and student submission detail contain integrity data
    detail_resp = client.get(f"/api/v1/tests/attempts/{attempt_id}/detail")
    assert detail_resp.status_code == 200, detail_resp.text
    detail = detail_resp.json()
    assert detail["integrity_summary"] is not None
    assert detail["integrity_summary"]["total_events"] == 2
    assert detail["integrity_summary"]["fullscreen_exits"] == 1
    assert detail["integrity_summary"]["tab_switches"] == 1

    # Check overview analytics
    analytics_resp = client.get(f"/api/v1/tests/{exam['test_id']}/analytics")
    assert analytics_resp.status_code == 200
    analytics = analytics_resp.json()
    assert len(analytics["student_submissions"]) == 1
    stud_row = analytics["student_submissions"][0]
    assert stud_row["integrity_events_count"] == 2
    assert "review_recommended" in stud_row
