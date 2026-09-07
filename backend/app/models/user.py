import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        default="ADMIN",
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="ACTIVE",
        nullable=False,
        index=True,
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    sessions: Mapped[List["UserSession"]] = relationship(  # noqa: F821
        "UserSession",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(UserSession.created_at)",
    )

    __table_args__ = (
        Index("ix_users_username_lower", "username"),
        Index("ix_users_email_lower", "email"),
    )

    def is_active(self) -> bool:
        return self.status == "ACTIVE"

    def is_admin(self) -> bool:
        return self.role in ("ADMIN", "PROFESSOR", "TEACHER", "SUPERADMIN")

    def is_super_admin(self) -> bool:
        return self.role in ("ADMIN", "SUPERADMIN")
