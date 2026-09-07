import uuid
from typing import List
from sqlalchemy import String, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TimestampMixin


class Topic(Base, TimestampMixin):
    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="ACTIVE",
        nullable=False,
        index=True,
    )

    # Relationships
    subject: Mapped["Subject"] = relationship(  # noqa: F821
        "Subject",
        back_populates="topics",
    )
    questions: Mapped[List["Question"]] = relationship(  # noqa: F821
        "Question",
        back_populates="topic",
    )

    __table_args__ = (
        UniqueConstraint("subject_id", "name", name="uq_topic_subject_name"),
        Index("ix_topics_subject_id_status", "subject_id", "status"),
    )

    def is_active(self) -> bool:
        return self.status == "ACTIVE"
