import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from backend.app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from backend.app.models.user import User
    from backend.app.models.test import Test


class TestSeries(Base, TimestampMixin):
    """Test Series grouping multiple examination tests."""

    __tablename__ = "test_series"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        default="DRAFT",
        nullable=False,
        index=True,
    )  # DRAFT, PUBLISHED, ARCHIVED
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    creator: Mapped["User"] = relationship("User")
    tests: Mapped[List["Test"]] = relationship("Test", back_populates="test_series")

    def __repr__(self) -> str:
        return f"<TestSeries {self.name} ({self.code})>"
