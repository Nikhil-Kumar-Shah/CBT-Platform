import uuid
from typing import TYPE_CHECKING, List, Optional
from datetime import datetime
from sqlalchemy import Float, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from backend.app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from backend.app.models.test import Test
    from backend.app.models.question import Question


class TestAttempt(Base, TimestampMixin):
    """Authoritative record of a student attempt on an examination paper."""

    __tablename__ = "test_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    test_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_name: Mapped[str] = mapped_column(String(150), nullable=False)
    candidate_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    candidate_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    roll_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_marks: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unattempted_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    time_taken_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="SUBMITTED", nullable=False)  # IN_PROGRESS, SUBMITTED, COMPLETED, EXPIRED, CANCELLED
    submission_reason: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # MANUAL, AUTO_EXPIRED, ADMIN_CONCLUDED, CANCELLED
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    question_order: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    option_orders: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_question_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    test: Mapped["Test"] = relationship("Test", back_populates="attempts")
    answers: Mapped[List["TestAttemptAnswer"]] = relationship(
        "TestAttemptAnswer",
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class TestAttemptAnswer(Base):
    """Detailed record of a student's answer for an individual question."""

    __tablename__ = "test_attempt_answers"

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
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    selected_option_ids: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # JSON or comma-separated
    numerical_answer: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    text_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_marked_for_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    marks_awarded: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    answered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    attempt: Mapped["TestAttempt"] = relationship("TestAttempt", back_populates="answers")
    question: Mapped["Question"] = relationship("Question")

