"""Test Builder and Test Series: test_series, tests, test_questions

Revision ID: 0003_test_builder
Revises: 0002_question_bank
Create Date: 2026-09-05 20:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_test_builder"
down_revision: Union[str, None] = "0002_question_bank"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create test_series table
    op.create_table(
        "test_series",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), server_default="DRAFT", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_test_series_code", "test_series", ["code"], unique=True)
    op.create_index("ix_test_series_status", "test_series", ["status"])

    # 2. Create tests table
    op.create_table(
        "tests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("test_series_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("test_series.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), server_default="60", nullable=False),
        sa.Column("status", sa.String(20), server_default="DRAFT", nullable=False),
        sa.Column("positive_marks", sa.Float(), server_default="4.0", nullable=False),
        sa.Column("negative_marks", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("question_order", sa.String(20), server_default="FIXED", nullable=False),
        sa.Column("option_order", sa.String(20), server_default="FIXED", nullable=False),
        sa.Column("result_visibility", sa.String(20), server_default="IMMEDIATELY", nullable=False),
        sa.Column("show_answers", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("show_explanation", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("allow_resume", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tests_code", "tests", ["code"], unique=True)
    op.create_index("ix_tests_status", "tests", ["status"])
    op.create_index("ix_tests_series_id", "tests", ["test_series_id"])
    op.create_index("idx_tests_status_created", "tests", ["status", "created_at"])
    op.create_index("idx_tests_series_status", "tests", ["test_series_id", "status"])

    # 3. Create test_questions association table
    op.create_table(
        "test_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("marks", sa.Float(), nullable=True),
        sa.Column("negative_marks", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("test_id", "question_id", name="uq_test_question_unique"),
    )
    op.create_index("idx_test_question_order", "test_questions", ["test_id", "order_index"])


def downgrade() -> None:
    op.drop_table("test_questions")
    op.drop_table("tests")
    op.drop_table("test_series")
