"""attempt integrity events audit log

Revision ID: 0008_attempt_integrity_events
Revises: 0007_exam_lifecycle_states
Create Date: 2026-09-06 18:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0008_attempt_integrity_events"
down_revision: Union[str, None] = "0007_exam_lifecycle_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "attempt_integrity_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "attempt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("test_attempts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("client_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("session_id", sa.String(64), nullable=True),
    )

    op.create_index(
        "ix_attempt_integrity_events_attempt_id",
        "attempt_integrity_events",
        ["attempt_id"],
    )
    op.create_index(
        "ix_attempt_integrity_events_event_type",
        "attempt_integrity_events",
        ["event_type"],
    )
    op.create_index(
        "ix_attempt_integrity_events_timestamp",
        "attempt_integrity_events",
        ["timestamp"],
    )
    op.create_index(
        "ix_attempt_integrity_events_attempt_timestamp",
        "attempt_integrity_events",
        ["attempt_id", "timestamp"],
    )
    op.create_index(
        "ix_attempt_integrity_events_attempt_type",
        "attempt_integrity_events",
        ["attempt_id", "event_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_attempt_integrity_events_attempt_type", table_name="attempt_integrity_events")
    op.drop_index("ix_attempt_integrity_events_attempt_timestamp", table_name="attempt_integrity_events")
    op.drop_index("ix_attempt_integrity_events_timestamp", table_name="attempt_integrity_events")
    op.drop_index("ix_attempt_integrity_events_event_type", table_name="attempt_integrity_events")
    op.drop_index("ix_attempt_integrity_events_attempt_id", table_name="attempt_integrity_events")
    op.drop_table("attempt_integrity_events")
