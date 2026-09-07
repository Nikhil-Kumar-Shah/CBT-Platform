import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import require_admin
from backend.app.models.user import User
from backend.app.services.audit_service import AuditService
from backend.app.schemas.audit import AuditEventResponse, AuditEventListResponse

router = APIRouter(prefix="/audit", tags=["Audit Log"])


@router.get(
    "",
    response_model=AuditEventListResponse,
    summary="List Universal Audit Events",
    description="Query and filter system-wide audit logs. Accessible only to authenticated administrators.",
)
def list_audit_events(
    search: Optional[str] = Query(None, description="Free text search across description, actor, action, resource"),
    category: Optional[str] = Query(None, description="Category filter (ADMIN, QUESTIONS, CANDIDATES, EXAM, SECURITY, SYSTEM)"),
    severity: Optional[str] = Query(None, description="Severity filter (INFO, WARNING, CRITICAL)"),
    actor: Optional[str] = Query(None, description="Actor filter"),
    resource_type: Optional[str] = Query(None, description="Target resource type"),
    start_date: Optional[datetime] = Query(None, description="Start date boundary (ISO 8601)"),
    end_date: Optional[datetime] = Query(None, description="End date boundary (ISO 8601)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    items, total, total_pages = AuditService.list_events(
        db=db,
        search=search,
        category=category,
        severity=severity,
        actor=actor,
        resource_type=resource_type,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )

    return AuditEventListResponse(
        items=[AuditEventResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{event_id}",
    response_model=AuditEventResponse,
    summary="Get Audit Event Details",
    description="Retrieve a single audit event with full contextual metadata.",
)
def get_audit_event_details(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    event = AuditService.get_event(db=db, event_id=event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit event not found.",
        )
    return AuditEventResponse.model_validate(event)
