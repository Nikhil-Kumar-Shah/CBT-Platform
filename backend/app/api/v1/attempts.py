import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.rate_limit import rate_limit, get_client_ip
from backend.app.models.user import User
from backend.app.api.deps import require_admin, get_optional_admin
from backend.app.schemas.attempt import (
    AccessCodeVerifyRequest,
    AccessCodeVerifyResponse,
    AttemptStartRequest,
    AttemptSessionStateResponse,
    AttemptSaveAnswerRequest,
    AttemptSaveAnswerResponse,
    AttemptHeartbeatRequest,
    AttemptHeartbeatResponse,
    AttemptSubmitRequest,
    AttemptResultResponse,
)
from backend.app.schemas.integrity import (
    IntegrityEventBatchRequest,
    IntegrityEventResponse,
    IntegritySummaryResponse,
)
from backend.app.services.attempt_service import AttemptService
from backend.app.services.integrity_service import IntegrityService
from backend.app.services.audit_service import AuditService
from backend.app.core.logging import logger

router = APIRouter(prefix="/attempts", tags=["Attempts"])

code_verify_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_CODE_VERIFY_PER_MINUTE,
    key_prefix="code_verify",
)

attempt_start_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_ATTEMPT_START_PER_MINUTE,
    key_prefix="attempt_start",
)

answer_save_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_ANSWER_SAVE_PER_MINUTE,
    key_prefix="answer_save",
)

heartbeat_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_HEARTBEAT_PER_MINUTE,
    key_prefix="heartbeat",
)

result_limiter = rate_limit(
    requests_per_minute=settings.RATE_LIMIT_RESULT_PER_MINUTE,
    key_prefix="result",
)

integrity_events_limiter = rate_limit(
    requests_per_minute=120,
    key_prefix="integrity_events",
)


@router.get(
    "/verify-access",
    response_model=AccessCodeVerifyResponse,
    dependencies=[Depends(code_verify_limiter)],
)
@router.get(
    "/verify-code",
    response_model=AccessCodeVerifyResponse,
    dependencies=[Depends(code_verify_limiter)],
)
def verify_access_code_get(
    request: Request,
    access_code: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Verify an examination access code via GET and return public test details."""
    target_code = access_code or code
    if not target_code or not target_code.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="access_code or code parameter is required.")
    client_ip = get_client_ip(request)
    return AttemptService.verify_access_code(db=db, access_code=target_code, client_ip=client_ip)


@router.post(
    "/verify-access",
    response_model=AccessCodeVerifyResponse,
    dependencies=[Depends(code_verify_limiter)],
)
@router.post(
    "/verify-code",
    response_model=AccessCodeVerifyResponse,
    dependencies=[Depends(code_verify_limiter)],
)
def verify_access_code_post(
    request: Request,
    payload: AccessCodeVerifyRequest,
    db: Session = Depends(get_db),
):
    """Verify an examination access code via POST and return public test details."""
    target_code = payload.access_code or payload.code
    if not target_code or not target_code.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="access_code or code field is required.")
    client_ip = get_client_ip(request)
    return AttemptService.verify_access_code(db=db, access_code=target_code, client_ip=client_ip)


@router.post(
    "/start",
    response_model=AttemptSessionStateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(attempt_start_limiter)],
)
def start_or_resume_attempt(
    payload: AttemptStartRequest,
    db: Session = Depends(get_db),
):
    """Start a new exam attempt or resume an active session for the candidate."""
    return AttemptService.start_or_resume_attempt(db=db, payload=payload)


@router.get("/{attempt_id}", response_model=AttemptSessionStateResponse)
@router.get("/{attempt_id}/state", response_model=AttemptSessionStateResponse)
def get_attempt_state(
    attempt_id: uuid.UUID,
    session_id: Optional[str] = Query(None),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    db: Session = Depends(get_db),
    optional_admin: Optional[User] = Depends(get_optional_admin),
):
    """Fetch authoritative state for an exam attempt."""
    effective_session = session_id or x_session_id
    is_admin = bool(optional_admin and optional_admin.is_admin())
    try:
        return AttemptService.get_attempt_state(
            db=db,
            attempt_id=attempt_id,
            session_id=effective_session,
            is_admin=is_admin,
        )
    except HTTPException:
        # Known HTTP exceptions (403 session mismatch, 404 not found, etc.) — pass through as-is
        raise
    except Exception as exc:
        # Unexpected error (e.g. AttributeError, DB issue) — audit-log then re-raise for global handler
        logger.exception(
            "Unhandled error in get_attempt_state for attempt_id=%s: %s", attempt_id, exc
        )
        try:
            AuditService.log(
                db=db,
                event_type="ATTEMPT_LOAD_FAILED",
                category="SECURITY",
                severity="CRITICAL",
                actor="SYSTEM",
                actor_type="SYSTEM",
                action="LOAD_STATE",
                resource_type="ATTEMPT",
                resource_id=str(attempt_id),
                description=(
                    f"Internal server error while loading exam session for attempt {attempt_id}. "
                    f"Candidate may have been unable to continue the exam. Error: {type(exc).__name__}: {exc}"
                ),
                session_id=effective_session,
                details={"error_type": type(exc).__name__, "error": str(exc)},
            )
        except Exception:
            pass
        raise


@router.post(
    "/{attempt_id}/answer",
    response_model=AttemptSaveAnswerResponse,
    dependencies=[Depends(answer_save_limiter)],
)
@router.post(
    "/{attempt_id}/answers",
    response_model=AttemptSaveAnswerResponse,
    dependencies=[Depends(answer_save_limiter)],
)
@router.put(
    "/{attempt_id}/answers",
    response_model=AttemptSaveAnswerResponse,
    dependencies=[Depends(answer_save_limiter)],
)
def save_answer(
    attempt_id: uuid.UUID,
    payload: AttemptSaveAnswerRequest,
    db: Session = Depends(get_db),
):
    """Save/update an answer response in real-time with server confirmation."""
    return AttemptService.save_answer(db=db, attempt_id=attempt_id, payload=payload)


@router.post(
    "/{attempt_id}/heartbeat",
    response_model=AttemptHeartbeatResponse,
    dependencies=[Depends(heartbeat_limiter)],
)
def heartbeat(
    attempt_id: uuid.UUID,
    payload: AttemptHeartbeatRequest,
    db: Session = Depends(get_db),
):
    """Sync time remaining and update candidate presence."""
    return AttemptService.heartbeat(db=db, attempt_id=attempt_id, payload=payload)


@router.post("/{attempt_id}/submit", response_model=AttemptResultResponse)
def submit_attempt(
    attempt_id: uuid.UUID,
    payload: AttemptSubmitRequest,
    db: Session = Depends(get_db),
):
    """Submit the examination for evaluation."""
    return AttemptService.submit_attempt(db=db, attempt_id=attempt_id, payload=payload)


@router.get(
    "/{attempt_id}/result",
    response_model=AttemptResultResponse,
    dependencies=[Depends(result_limiter)],
)
def get_attempt_result(
    attempt_id: uuid.UUID,
    session_id: Optional[str] = Query(None),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    db: Session = Depends(get_db),
    optional_admin: Optional[User] = Depends(get_optional_admin),
):
    """Retrieve completion result / scorecard for a submitted attempt."""
    effective_session = session_id or x_session_id
    is_admin = bool(optional_admin and optional_admin.is_admin())
    return AttemptService.get_attempt_result(
        db=db,
        attempt_id=attempt_id,
        session_id=effective_session,
        is_admin=is_admin,
    )


@router.post(
    "/{attempt_id}/integrity-events",
    response_model=List[IntegrityEventResponse],
    dependencies=[Depends(integrity_events_limiter)],
)
def record_integrity_events(
    attempt_id: uuid.UUID,
    payload: IntegrityEventBatchRequest,
    session_id: Optional[str] = Query(None),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    db: Session = Depends(get_db),
):
    """Ingest candidate client integrity events with authoritative server timestamps."""
    effective_session = session_id or x_session_id
    return IntegrityService.record_events(
        db=db,
        attempt_id=attempt_id,
        events=payload.events,
        session_id=effective_session,
    )



@router.get(
    "/{attempt_id}/integrity",
    response_model=IntegritySummaryResponse,
)
def get_attempt_integrity(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Retrieve summarized integrity metrics and chronological event timeline for teacher review."""
    return IntegrityService.get_attempt_integrity_summary(db=db, attempt_id=attempt_id)
