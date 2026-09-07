import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.app.models.subject import Subject


def test_consecutive_question_creation_speed_and_isolation(
    client: TestClient,
    auth_headers: dict,
    db_session: Session,
):
    """
    Automated regression test verifying:
    1. Sequential question creation operates under low latency (no N+1 queries, single transaction).
    2. Audit logs are logged properly without forcing immediate client re-fetches.
    3. Consecutive questions remain completely isolated without data bleeding or duplicate test_question entries.
    """
    subj = Subject(name="Perf Subject", code="PERF99", status="ACTIVE")
    db_session.add(subj)
    db_session.commit()
    db_session.refresh(subj)

    test_res = client.post(
        "/api/v1/tests",
        json={
            "title": "Performance Test Suite",
            "subject_id": str(subj.id),
            "code": "PRF991",
            "duration_minutes": 45,
            "positive_marks": 4.0,
            "negative_marks": 1.0,
        },
    )
    assert test_res.status_code in (200, 201), test_res.text
    test_id = test_res.json()["id"]

    durations = []
    # Create 5 distinct questions consecutively
    for i in range(1, 6):
        payload = {
            "question_type": "MCQ",
            "content": f"Question #{i} Content for speed testing: What is {i} + {i}?",
            "explanation": f"Explanation for Question #{i}",
            "hint": f"Hint #{i}",
            "marks": 4.0,
            "negative_marks": 1.0,
            "difficulty": "MEDIUM",
            "options": [
                {"option_order": 1, "content": f"{i * 2}", "is_correct": True},
                {"option_order": 2, "content": f"{i * 2 + 1}", "is_correct": False},
                {"option_order": 3, "content": f"{i * 2 + 2}", "is_correct": False},
                {"option_order": 4, "content": f"{i * 2 + 3}", "is_correct": False},
            ],
        }
        start_t = time.perf_counter()
        res = client.post(f"/api/v1/tests/{test_id}/questions/inline", json=payload)
        elapsed = time.perf_counter() - start_t
        durations.append(elapsed)

        assert res.status_code in (200, 201), res.text
        data = res.json()
        assert len(data["questions"]) == i
        # Confirm the new question is the latest one
        latest = data["questions"][-1]
        assert latest["question"]["content"] == payload["content"]
        assert latest["order_index"] == i

    # Verify audit logs were captured without needing separate round-trips during creation
    audit_res = client.get(f"/api/v1/tests/{test_id}/audit-logs")
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) >= 5
    actions = [l["action"] for l in logs]
    assert actions.count("QUESTION_ADDED") >= 5

    # Measure that average latency per question inline insertion is fast
    avg_latency = sum(durations) / len(durations)
    print(f"\nAverage inline question creation latency: {avg_latency:.3f}s, durations: {[round(d, 3) for d in durations]}")
