import uuid
from typing import List
from sqlalchemy import String, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TimestampMixin


class Subject(Base, TimestampMixin):
    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="ACTIVE",
        nullable=False,
        index=True,
    )

    # Relationships
    topics: Mapped[List["Topic"]] = relationship(  # noqa: F821
        "Topic",
        back_populates="subject",
        cascade="all, delete-orphan",
        order_by="Topic.name",
    )
    questions: Mapped[List["Question"]] = relationship(  # noqa: F821
        "Question",
        back_populates="subject",
    )

    def is_active(self) -> bool:
        return self.status == "ACTIVE"
