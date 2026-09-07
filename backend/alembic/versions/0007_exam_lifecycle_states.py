"""Exam lifecycle states and attempt submission reason tracking

Revision ID: 0007_exam_lifecycle_states
Revises: 0006_candidate_contact_info
Create Date: 2026-09-06 16:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0007_exam_lifecycle_states"
down_revision: Union[str, None] = "0006_candidate_contact_info"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add lifecycle columns to tests
    op.add_column("tests", sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tests", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tests", sa.Column("cancelled_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("tests", sa.Column("cancel_reason", sa.Text(), nullable=True))

    # Add foreign key constraint for cancelled_by
    op.create_foreign_key(
        "fk_tests_cancelled_by_users",
        "tests",
        "users",
        ["cancelled_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2. Add submission_reason and expired_at to test_attempts
    op.add_column("test_attempts", sa.Column("submission_reason", sa.String(50), nullable=True))
    op.add_column("test_attempts", sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("test_attempts", "expired_at")
    op.drop_column("test_attempts", "submission_reason")
    op.drop_constraint("fk_tests_cancelled_by_users", "tests", type_="foreignkey")
    op.drop_column("tests", "cancel_reason")
    op.drop_column("tests", "cancelled_by")
    op.drop_column("tests", "cancelled_at")
    op.drop_column("tests", "paused_at")
