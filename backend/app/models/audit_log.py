import uuid
from datetime import datetime
from typing import Optional, Any, Dict
from sqlalchemy import (
    String,
    Text,
    DateTime,
    Index,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from backend.app.models.base import Base


class AuditEvent(Base):
    """Universal, system-wide, append-only audit event log.

    Captures all administrative, question management, candidate lifecycle,
    examination, and security actions across the platform.
    """

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )  # e.g., 'ADMIN_LOGIN', 'TEST_CREATED', 'CANDIDATE_ATTEMPT_STARTED', 'SECURITY_UNAUTHORIZED'
    category: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
    )  # 'ADMIN', 'QUESTIONS', 'CANDIDATES', 'EXAM', 'SECURITY', 'SYSTEM'
    severity: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="INFO",
        index=True,
    )  # 'INFO', 'WARNING', 'CRITICAL'
    actor: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )  # e.g., 'admin', 'Candidate: John Doe', 'System', 'Anonymous'
    actor_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="SYSTEM",
    )  # 'ADMIN', 'CANDIDATE', 'SYSTEM', 'ANONYMOUS'
    action: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )  # e.g., 'LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'START', 'SUBMIT'
    resource_type: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )  # e.g., 'TEST', 'QUESTION', 'ATTEMPT', 'SESSION', 'SECURITY', 'SYSTEM'
    resource_id: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
    )  # e.g. test code, question ID, attempt ID
    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )  # Human-readable explanation of what occurred
    ip_address: Mapped[Optional[str]] = mapped_column(
        String(45),
        nullable=True,
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
    )
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_audit_events_query", "category", "severity", "timestamp"),
        Index("ix_audit_events_actor_time", "actor", "timestamp"),
        Index("ix_audit_events_resource_lookup", "resource_type", "resource_id"),
    )

    def __repr__(self) -> str:
        return f"<AuditEvent {self.event_type} [{self.category}/{self.severity}] by {self.actor}>"
