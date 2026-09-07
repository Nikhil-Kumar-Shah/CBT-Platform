import uuid
from typing import List, Optional
from sqlalchemy import (
    String,
    Text,
    Numeric,
    ForeignKey,
    Index,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TimestampMixin


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    question_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
    )  # 'MCQ', 'MULTIPLE_CHOICE', 'NUMERICAL', 'TRUE_FALSE', 'ASSERTION_REASON', 'MATCH_THE_FOLLOWING', 'FILL_BLANK'
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    topic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("topics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    difficulty: Mapped[str] = mapped_column(
        String(20),
        default="MEDIUM",
        nullable=False,
        index=True,
    )  # 'EASY', 'MEDIUM', 'HARD'
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )  # Supports text, markdown, and LaTeX formulas
    explanation: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    hint: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    marks: Mapped[float] = mapped_column(
        Numeric(5, 2),
        default=4.00,
        nullable=False,
    )
    negative_marks: Mapped[float] = mapped_column(
        Numeric(5, 2),
        default=1.00,
        nullable=False,
    )
    numerical_answer: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    numerical_tolerance: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 4),
        default=0.0000,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="ACTIVE",
        nullable=False,
        index=True,
    )  # 'ACTIVE' or 'ARCHIVED'
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    subject: Mapped["Subject"] = relationship(  # noqa: F821
        "Subject",
        back_populates="questions",
    )
    topic: Mapped[Optional["Topic"]] = relationship(  # noqa: F821
        "Topic",
        back_populates="questions",
    )
    options: Mapped[List["QuestionOption"]] = relationship(  # noqa: F821
        "QuestionOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionOption.option_order",
    )
    media: Mapped[List["QuestionMedia"]] = relationship(  # noqa: F821
        "QuestionMedia",
        back_populates="question",
        order_by="QuestionMedia.display_order",
    )

    __table_args__ = (
        CheckConstraint(
            "question_type IN ('MCQ', 'MULTIPLE_CHOICE', 'NUMERICAL', 'TRUE_FALSE', 'ASSERTION_REASON', 'MATCH_THE_FOLLOWING', 'FILL_BLANK')",
            name="ck_question_type",
        ),
        CheckConstraint("difficulty IN ('EASY', 'MEDIUM', 'HARD')", name="ck_question_difficulty"),
        CheckConstraint("status IN ('ACTIVE', 'ARCHIVED')", name="ck_question_status"),
        CheckConstraint("marks >= 0", name="ck_question_marks_positive"),
        CheckConstraint("negative_marks >= 0", name="ck_question_negative_marks_positive"),
        Index("ix_questions_filter", "subject_id", "topic_id", "question_type", "difficulty", "status"),
    )

    def is_active(self) -> bool:
        return self.status == "ACTIVE"

    def is_mcq(self) -> bool:
        return self.question_type == "MCQ"

    def is_numerical(self) -> bool:
        return self.question_type == "NUMERICAL"
