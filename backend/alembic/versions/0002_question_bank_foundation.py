"""Question Bank Foundation: subjects, topics, questions, question_options, question_media

Revision ID: 0002_question_bank
Revises: 0001_phase1_init
Create Date: 2026-09-05 20:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_question_bank"
down_revision: Union[str, None] = "0001_phase1_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create subjects table
    op.create_table(
        "subjects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), server_default="ACTIVE", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subjects_name", "subjects", ["name"], unique=True)
    op.create_index("ix_subjects_code", "subjects", ["code"], unique=True)
    op.create_index("ix_subjects_status", "subjects", ["status"])

    # 2. Create topics table
    op.create_table(
        "topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("status", sa.String(20), server_default="ACTIVE", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("subject_id", "name", name="uq_topic_subject_name"),
    )
    op.create_index("ix_topics_subject_id", "topics", ["subject_id"])
    op.create_index("ix_topics_status", "topics", ["status"])
    op.create_index("ix_topics_subject_id_status", "topics", ["subject_id", "status"])

    # 3. Create questions table
    op.create_table(
        "questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("question_type", sa.String(20), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("difficulty", sa.String(20), server_default="MEDIUM", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("marks", sa.Numeric(5, 2), server_default="4.00", nullable=False),
        sa.Column("negative_marks", sa.Numeric(5, 2), server_default="1.00", nullable=False),
        sa.Column("numerical_answer", sa.Numeric(12, 4), nullable=True),
        sa.Column("numerical_tolerance", sa.Numeric(12, 4), server_default="0.0000", nullable=True),
        sa.Column("status", sa.String(20), server_default="ACTIVE", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.CheckConstraint("question_type IN ('MCQ', 'NUMERICAL')", name="ck_question_type"),
        sa.CheckConstraint("difficulty IN ('EASY', 'MEDIUM', 'HARD')", name="ck_question_difficulty"),
        sa.CheckConstraint("status IN ('ACTIVE', 'ARCHIVED')", name="ck_question_status"),
        sa.CheckConstraint("marks >= 0", name="ck_question_marks_positive"),
        sa.CheckConstraint("negative_marks >= 0", name="ck_question_negative_marks_positive"),
    )
    op.create_index("ix_questions_subject_id", "questions", ["subject_id"])
    op.create_index("ix_questions_topic_id", "questions", ["topic_id"])
    op.create_index("ix_questions_question_type", "questions", ["question_type"])
    op.create_index("ix_questions_difficulty", "questions", ["difficulty"])
    op.create_index("ix_questions_status", "questions", ["status"])
    op.create_index(
        "ix_questions_filter",
        "questions",
        ["subject_id", "topic_id", "question_type", "difficulty", "status"],
    )

    # 4. Create question_options table
    op.create_table(
        "question_options",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("option_order", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.UniqueConstraint("question_id", "option_order", name="uq_question_option_order"),
    )
    op.create_index("ix_question_options_question_id", "question_options", ["question_id"])
    op.create_index("ix_question_options_lookup", "question_options", ["question_id", "option_order"])

    # 5. Create question_media table
    op.create_table(
        "question_media",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("storage_key", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_question_media_question_id", "question_media", ["question_id"])
    op.create_index("ix_question_media_storage_key", "question_media", ["storage_key"], unique=True)
    op.create_index("ix_question_media_question_order", "question_media", ["question_id", "display_order"])


def downgrade() -> None:
    op.drop_table("question_media")
    op.drop_table("question_options")
    op.drop_table("questions")
    op.drop_table("topics")
    op.drop_table("subjects")
