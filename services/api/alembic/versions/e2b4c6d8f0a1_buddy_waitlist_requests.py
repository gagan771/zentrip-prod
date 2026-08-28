"""buddy waitlist requests

Revision ID: e2b4c6d8f0a1
Revises: a7b8c9d0e1f2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2b4c6d8f0a1"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "buddy_waitlist_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.String(length=80), nullable=False),
        sa.Column("group_name", sa.String(length=200), nullable=False),
        sa.Column("request_text", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_buddy_waitlist_user_group",
        "buddy_waitlist_requests",
        ["user_id", "group_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_buddy_waitlist_user_group", table_name="buddy_waitlist_requests")
    op.drop_table("buddy_waitlist_requests")
