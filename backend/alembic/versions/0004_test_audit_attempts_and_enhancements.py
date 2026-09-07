"""Add test audit logs, attempts, answers, and test/question enhancements

Revision ID: 0004_test_audit_and_attempts
Revises: 0003_test_builder
Create Date: 2026-09-05 21:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_test_audit_and_attempts"
down_revision: Union[str, None] = "0003_test_builder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Alter tests table to add topics_covered, start_time, end_time, published_at
    op.add_column("tests", sa.Column("topics_covered", sa.Text(), nullable=True))
    op.add_column("tests", sa.Column("start_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tests", sa.Column("end_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tests", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))

    # 2. Alter questions table to add hint
    op.add_column("questions", sa.Column("hint", sa.Text(), nullable=True))

    # 3. Create test_audit_logs table
    op.create_table(
        "test_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_test_audit_logs_test_id", "test_audit_logs", ["test_id"])

    # 4. Create test_attempts table
    op.create_table(
        "test_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_name", sa.String(150), nullable=False),
        sa.Column("roll_number", sa.String(50), nullable=True),
        sa.Column("score", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("total_marks", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("percentage", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("correct_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("incorrect_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("unattempted_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("time_taken_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(20), server_default="SUBMITTED", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_test_attempts_test_id", "test_attempts", ["test_id"])

    # 5. Create test_attempt_answers table
    op.create_table(
        "test_attempt_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("selected_option_ids", sa.String(500), nullable=True),
        sa.Column("numerical_answer", sa.Float(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("marks_awarded", sa.Float(), server_default="0.0", nullable=False),
    )
    op.create_index("ix_test_attempt_answers_attempt_id", "test_attempt_answers", ["attempt_id"])


def downgrade() -> None:
    op.drop_table("test_attempt_answers")
    op.drop_table("test_attempts")
    op.drop_table("test_audit_logs")
    op.drop_column("questions", "hint")
    op.drop_column("tests", "published_at")
    op.drop_column("tests", "end_time")
    op.drop_column("tests", "start_time")
    op.drop_column("tests", "topics_covered")
