import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, Float, Integer, String, Text, ForeignKey, Index, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from backend.app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from backend.app.models.user import User
    from backend.app.models.subject import Subject
    from backend.app.models.test_series import TestSeries
    from backend.app.models.test_question import TestQuestion
    from backend.app.models.test_audit_log import TestAuditLog
    from backend.app.models.test_attempt import TestAttempt


class Test(Base, TimestampMixin):
    """Test examination paper containing ordered questions, scheduling, and exam configuration."""

    __tablename__ = "tests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topics_covered: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    test_series_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("test_series.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    series_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    status: Mapped[str] = mapped_column(
        String(20),
        default="DRAFT",
        nullable=False,
        index=True,
    )  # DRAFT, SCHEDULED, LIVE, COMPLETED, ARCHIVED

    start_time: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Test settings
    positive_marks: Mapped[float] = mapped_column(Float, nullable=False, default=4.0)
    negative_marks: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    question_order: Mapped[str] = mapped_column(String(20), nullable=False, default="FIXED")  # FIXED, RANDOM
    option_order: Mapped[str] = mapped_column(String(20), nullable=False, default="FIXED")  # FIXED, RANDOM
    result_visibility: Mapped[str] = mapped_column(
        String(20), nullable=False, default="IMMEDIATELY"
    )  # IMMEDIATELY, HIDDEN, SCHEDULED
    show_answers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_explanation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_resume: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Relationships
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    canceller: Mapped[Optional["User"]] = relationship("User", foreign_keys=[cancelled_by])
    test_series: Mapped[Optional["TestSeries"]] = relationship("TestSeries", back_populates="tests")
    subject: Mapped[Optional["Subject"]] = relationship("Subject")
    test_questions: Mapped[List["TestQuestion"]] = relationship(
        "TestQuestion",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="TestQuestion.order_index",
    )
    audit_logs: Mapped[List["TestAuditLog"]] = relationship(
        "TestAuditLog",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="TestAuditLog.created_at.desc()",
    )
    attempts: Mapped[List["TestAttempt"]] = relationship(
        "TestAttempt",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="TestAttempt.started_at.desc()",
    )

    __table_args__ = (
        Index("idx_tests_status_created", "status", "created_at"),
        Index("idx_tests_series_status", "test_series_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<Test {self.title} ({self.code}) - {self.status}>"
