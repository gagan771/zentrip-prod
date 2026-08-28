"""guardian incident state machine

Revision ID: c4e8f2a1b6d0
Revises: b7d2e4c8f1a0
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e8f2a1b6d0"
down_revision: Union[str, None] = "b7d2e4c8f1a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guardian_incidents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("checkin_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_guardian_incidents_user_status", "guardian_incidents", ["user_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_guardian_incidents_user_status", table_name="guardian_incidents")
    op.drop_table("guardian_incidents")
