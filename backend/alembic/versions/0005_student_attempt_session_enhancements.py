"""Student attempt and session enhancements for Phase 4

Revision ID: 0005_student_attempt_enhancements
Revises: 0004_test_audit_and_attempts
Create Date: 2026-09-05 23:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_student_attempts"
down_revision: Union[str, None] = "0004_test_audit_and_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add fields to test_attempts for server-authoritative timer, sessions, and stable ordering
    op.add_column("test_attempts", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("test_attempts", sa.Column("session_id", sa.String(64), nullable=True))
    op.add_column("test_attempts", sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("test_attempts", sa.Column("question_order", sa.Text(), nullable=True))
    op.add_column("test_attempts", sa.Column("option_orders", sa.Text(), nullable=True))
    op.add_column("test_attempts", sa.Column("current_question_index", sa.Integer(), server_default="0", nullable=False))

    op.create_index("ix_test_attempts_session_id", "test_attempts", ["session_id"])
    op.create_index("ix_test_attempts_status_expires", "test_attempts", ["status", "expires_at"])

    # 2. Add fields to test_attempt_answers for review tracking and text answers
    op.add_column("test_attempt_answers", sa.Column("text_answer", sa.Text(), nullable=True))
    op.add_column("test_attempt_answers", sa.Column("is_marked_for_review", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("test_attempt_answers", sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("test_attempt_answers", "answered_at")
    op.drop_column("test_attempt_answers", "is_marked_for_review")
    op.drop_column("test_attempt_answers", "text_answer")

    op.drop_index("ix_test_attempts_status_expires", table_name="test_attempts")
    op.drop_index("ix_test_attempts_session_id", table_name="test_attempts")
    op.drop_column("test_attempts", "current_question_index")
    op.drop_column("test_attempts", "option_orders")
    op.drop_column("test_attempts", "question_order")
    op.drop_column("test_attempts", "last_heartbeat_at")
    op.drop_column("test_attempts", "session_id")
    op.drop_column("test_attempts", "expires_at")
