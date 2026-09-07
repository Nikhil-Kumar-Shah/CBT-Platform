"""Candidate contact information (email and phone) for attempts

Revision ID: 0006_candidate_contact_info
Revises: 0005_student_attempts
Create Date: 2026-09-06 15:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006_candidate_contact_info"
down_revision: Union[str, None] = "0005_student_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("test_attempts", sa.Column("candidate_email", sa.String(255), nullable=True))
    op.add_column("test_attempts", sa.Column("candidate_phone", sa.String(50), nullable=True))
    op.create_index("ix_test_attempts_test_email", "test_attempts", ["test_id", "candidate_email"])


def downgrade() -> None:
    op.drop_index("ix_test_attempts_test_email", table_name="test_attempts")
    op.drop_column("test_attempts", "candidate_phone")
    op.drop_column("test_attempts", "candidate_email")
