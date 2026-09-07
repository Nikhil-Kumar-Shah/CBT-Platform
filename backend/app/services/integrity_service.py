import uuid
from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from backend.app.models.test_attempt import TestAttempt
from backend.app.models.attempt_integrity_event import AttemptIntegrityEvent
from backend.app.schemas.integrity import (
    IntegrityEventCreate,
    IntegrityEventResponse,
    IntegritySummaryResponse,
)
from backend.app.services.audit_service import AuditService


class IntegrityService:
    @staticmethod
    def record_events(
        db: Session,
        attempt_id: uuid.UUID,
        events: List[IntegrityEventCreate],
        session_id: Optional[str] = None,
    ) -> List[IntegrityEventResponse]:
        """Record batch integrity events for an examination attempt with authoritative server timestamps."""
        attempt = db.scalar(select(TestAttempt).where(TestAttempt.id == attempt_id))
        if not attempt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Test attempt not found.",
            )

        if attempt.status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot log integrity events for a cancelled attempt.",
            )

        # Validate session id if attempt has one assigned
        effective_session_id = session_id or (events[0].session_id if events else None)
        if attempt.session_id and effective_session_id and attempt.session_id != effective_session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid session credentials for logging integrity events.",
            )

        created_records = []
        for ev in events:
            record = AttemptIntegrityEvent(
                id=uuid.uuid4(),
                attempt_id=attempt_id,
                event_type=ev.event_type.strip().upper(),
                client_timestamp=ev.client_timestamp,
                duration_seconds=ev.duration_seconds,
                metadata_json=ev.metadata_json,
                session_id=ev.session_id or effective_session_id or attempt.session_id,
            )
            db.add(record)
            created_records.append(record)

            try:
                AuditService.log(
                    db=db,
                    event_type=f"PROCTORING_{record.event_type}",
                    category="SECURITY",
                    severity="WARNING",
                    actor=attempt.student_name or "Candidate",
                    actor_type="CANDIDATE",
                    action=record.event_type,
                    resource_type="ATTEMPT",
                    resource_id=str(attempt_id),
                    description=f"Integrity alert: {record.event_type} ({record.duration_seconds or 0}s)",
                    session_id=record.session_id,
                    details={"duration_seconds": record.duration_seconds},
                )
            except Exception:
                pass

        db.commit()
        for r in created_records:
            db.refresh(r)

        return [IntegrityEventResponse.model_validate(r) for r in created_records]

    @staticmethod
    def get_attempt_integrity_summary(
        db: Session,
        attempt_id: uuid.UUID,
    ) -> IntegritySummaryResponse:
        """Compute aggregated integrity summary and chronological timeline for teacher inspection."""
        attempt = db.scalar(select(TestAttempt).where(TestAttempt.id == attempt_id))
        if not attempt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Test attempt not found.",
            )

        events_stmt = (
            select(AttemptIntegrityEvent)
            .where(AttemptIntegrityEvent.attempt_id == attempt_id)
            .order_by(AttemptIntegrityEvent.timestamp.asc())
        )
        records = db.scalars(events_stmt).all()

        total_events = len(records)
        tab_switches = 0
        fullscreen_exits = 0
        multiple_tab_detections = 0
        network_interruptions = 0
        refresh_count = 0
        inactivity_warnings = 0
        total_inactive_seconds = 0.0

        for r in records:
            etype = r.event_type.upper()
            if etype in ("TAB_SWITCHED", "VISIBILITY_HIDDEN"):
                tab_switches += 1
            elif etype == "FULLSCREEN_EXITED":
                fullscreen_exits += 1
            elif etype == "MULTIPLE_TAB_DETECTED":
                multiple_tab_detections += 1
            elif etype == "NETWORK_DISCONNECTED":
                network_interruptions += 1
            elif etype == "PAGE_REFRESHED":
                refresh_count += 1
            elif "INACTIVITY" in etype:
                inactivity_warnings += 1
                if r.duration_seconds:
                    total_inactive_seconds += float(r.duration_seconds)

        # Non-adversarial review recommendation heuristics
        review_reasons = []
        if multiple_tab_detections > 0:
            review_reasons.append(f"{multiple_tab_detections} concurrent tab access detected")
        if tab_switches >= 3:
            review_reasons.append(f"{tab_switches} window/tab transitions detected")
        if fullscreen_exits >= 3:
            review_reasons.append(f"{fullscreen_exits} fullscreen exits detected")
        if total_inactive_seconds >= 180:
            minutes = round(total_inactive_seconds / 60, 1)
            review_reasons.append(f"{minutes} minutes total prolonged idle time")

        review_recommended = len(review_reasons) > 0

        event_responses = [IntegrityEventResponse.model_validate(r) for r in records]

        return IntegritySummaryResponse(
            attempt_id=attempt_id,
            total_events=total_events,
            tab_switches=tab_switches,
            fullscreen_exits=fullscreen_exits,
            multiple_tab_detections=multiple_tab_detections,
            inactivity_warnings=inactivity_warnings,
            network_interruptions=network_interruptions,
            total_inactive_seconds=round(total_inactive_seconds, 1),
            refresh_count=refresh_count,
            review_recommended=review_recommended,
            review_reasons=review_reasons,
            events=event_responses,
        )
