import uuid
from typing import TYPE_CHECKING, Optional
from datetime import datetime
from sqlalchemy import Float, String, Text, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from backend.app.models.base import Base

if TYPE_CHECKING:
    from backend.app.models.test_attempt import TestAttempt


class AttemptIntegrityEvent(Base):
    """Append-only audit log of examination integrity and environment events."""

    __tablename__ = "attempt_integrity_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("test_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    client_timestamp: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration_seconds: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )
    metadata_json: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )

    attempt: Mapped["TestAttempt"] = relationship("TestAttempt", backref="integrity_events")

    __table_args__ = (
        Index("ix_attempt_integrity_events_attempt_timestamp", "attempt_id", "timestamp"),
        Index("ix_attempt_integrity_events_attempt_type", "attempt_id", "event_type"),
    )
