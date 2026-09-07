import math
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import desc, select, or_, and_, func
from sqlalchemy.orm import Session

from backend.app.core.logging import logger
from backend.app.models.audit_log import AuditEvent

# Sensitive keys that must NEVER be persisted in audit event metadata
SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "token",
    "session_token",
    "secret",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
}


def sanitize_audit_details(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Sanitize metadata dictionary to guarantee sensitive credentials, tokens,

    and passwords are removed before persisting in the universal audit log.
    """
    if not data or not isinstance(data, dict):
        return None

    sanitized = {}
    for k, v in data.items():
        k_lower = str(k).lower()
        if any(sensitive in k_lower for sensitive in SENSITIVE_KEYS):
            sanitized[k] = "[REDACTED]"
        elif k_lower == "access_code" and isinstance(v, str):
            # Mask access code partially for security (keep prefix only)
            sanitized[k] = v[:3] + "****" if len(v) > 3 else "****"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_audit_details(v)
        elif isinstance(v, list):
            sanitized[k] = [
                sanitize_audit_details(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            sanitized[k] = v
    return sanitized


class AuditService:
    """Centralized, append-only service for universal audit logging and inspection."""

    @staticmethod
    def log(
        db: Session,
        event_type: str,
        category: str,
        severity: str,
        actor: str,
        action: str,
        description: str,
        actor_type: str = "SYSTEM",
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        session_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        commit: bool = True,
    ) -> Optional[AuditEvent]:
        """Record an append-only audit event safely.

        Never raises exceptions that would disrupt the calling business workflow.
        """
        try:
            clean_details = sanitize_audit_details(details)
            event = AuditEvent(
                event_type=event_type,
                category=category.upper(),
                severity=severity.upper(),
                actor=actor,
                actor_type=actor_type.upper(),
                action=action.upper(),
                resource_type=resource_type.upper() if resource_type else None,
                resource_id=str(resource_id) if resource_id else None,
                description=description,
                ip_address=ip_address,
                session_id=str(session_id) if session_id else None,
                details=clean_details,
            )
            db.add(event)
            if commit:
                db.commit()
                db.refresh(event)
            return event
        except Exception as exc:
            logger.error("Failed to persist audit event [%s/%s]: %s", category, event_type, exc)
            try:
                db.rollback()
            except Exception:
                pass
            return None

    @staticmethod
    def list_events(
        db: Session,
        search: Optional[str] = None,
        category: Optional[str] = None,
        severity: Optional[str] = None,
        actor: Optional[str] = None,
        resource_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> Tuple[List[AuditEvent], int, int]:
        """Retrieve paginated audit events with rich administrative filtering."""
        query = select(AuditEvent)
        filters = []

        if category and category.upper() != "ALL":
            filters.append(AuditEvent.category == category.upper())

        if severity and severity.upper() != "ALL":
            filters.append(AuditEvent.severity == severity.upper())

        if actor and actor.strip():
            filters.append(AuditEvent.actor.ilike(f"%{actor.strip()}%"))

        if resource_type and resource_type.upper() != "ALL":
            filters.append(AuditEvent.resource_type == resource_type.upper())

        if start_date:
            filters.append(AuditEvent.timestamp >= start_date)

        if end_date:
            filters.append(AuditEvent.timestamp <= end_date)

        if search and search.strip():
            search_term = f"%{search.strip()}%"
            filters.append(
                or_(
                    AuditEvent.description.ilike(search_term),
                    AuditEvent.actor.ilike(search_term),
                    AuditEvent.event_type.ilike(search_term),
                    AuditEvent.action.ilike(search_term),
                    AuditEvent.resource_id.ilike(search_term),
                )
            )

        if filters:
            query = query.where(and_(*filters))

        # Total count query
        count_stmt = select(func.count(AuditEvent.id))
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total = db.scalar(count_stmt) or 0

        # Pagination and ordering
        total_pages = math.ceil(total / page_size) if total > 0 else 1
        safe_page = max(1, page)
        offset = (safe_page - 1) * page_size

        items_stmt = query.order_by(desc(AuditEvent.timestamp)).offset(offset).limit(page_size)
        items = list(db.scalars(items_stmt).all())

        return items, total, total_pages

    @staticmethod
    def get_event(db: Session, event_id: uuid.UUID) -> Optional[AuditEvent]:
        """Retrieve a specific audit event by ID."""
        return db.get(AuditEvent, event_id)
