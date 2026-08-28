"""buddy mutual-consent pairs and messages

Revision ID: f3c5d7e9a0b2
Revises: e2b4c6d8f0a1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f3c5d7e9a0b2"
down_revision: Union[str, None] = "e2b4c6d8f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_buddy_waitlist_group_status",
        "buddy_waitlist_requests",
        ["group_id", "status"],
        unique=False,
    )
    op.create_table(
        "buddy_pair_consents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", sa.String(length=80), nullable=False),
        sa.Column("user_low_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_high_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("low_consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("high_consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_low_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_high_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "user_low_id", "user_high_id", name="uq_buddy_pair_group_users"),
    )
    op.create_index("ix_buddy_pair_low", "buddy_pair_consents", ["user_low_id"])
    op.create_index("ix_buddy_pair_high", "buddy_pair_consents", ["user_high_id"])
    op.create_table(
        "buddy_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pair_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["pair_id"], ["buddy_pair_consents.id"]),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_buddy_messages_pair_created", "buddy_messages", ["pair_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_buddy_messages_pair_created", table_name="buddy_messages")
    op.drop_table("buddy_messages")
    op.drop_index("ix_buddy_pair_high", table_name="buddy_pair_consents")
    op.drop_index("ix_buddy_pair_low", table_name="buddy_pair_consents")
    op.drop_table("buddy_pair_consents")
    op.drop_index("ix_buddy_waitlist_group_status", table_name="buddy_waitlist_requests")
