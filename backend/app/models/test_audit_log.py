import uuid
from typing import TYPE_CHECKING
from sqlalchemy import String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from backend.app.models.base import Base

if TYPE_CHECKING:
    from backend.app.models.test import Test
    from backend.app.models.user import User


class TestAuditLog(Base):
    """Logs all significant administrative actions on a Test."""

    __tablename__ = "test_audit_logs"

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
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., TEST_CREATED, QUESTION_ADDED, etc.
    details: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    test: Mapped["Test"] = relationship("Test", back_populates="audit_logs")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<TestAuditLog {self.action} on Test {self.test_id}>"
