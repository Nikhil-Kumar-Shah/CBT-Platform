import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Float, Integer, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from backend.app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from backend.app.models.test import Test
    from backend.app.models.question import Question


class TestQuestion(Base, TimestampMixin):
    """Associates a Question with a Test, specifying its sequence order and optional marks override."""

    __tablename__ = "test_questions"

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
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    negative_marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    test: Mapped["Test"] = relationship("Test", back_populates="test_questions")
    question: Mapped["Question"] = relationship("Question")

    __table_args__ = (
        UniqueConstraint("test_id", "question_id", name="uq_test_question_unique"),
        Index("idx_test_question_order", "test_id", "order_index"),
    )

    def __repr__(self) -> str:
        return f"<TestQuestion test={self.test_id} question={self.question_id} order={self.order_index}>"
