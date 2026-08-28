"""journey bookings and grocery handoff sessions

Revision ID: b7d2e4c8f1a0
Revises: 133970d04c84
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7d2e4c8f1a0"
down_revision: Union[str, None] = "133970d04c84"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trip_bookings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("trip_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("provider", sa.String(length=100), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("deep_link", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trip_bookings_trip_id", "trip_bookings", ["trip_id"])
    op.create_index("ix_trip_bookings_user_id", "trip_bookings", ["user_id"])
    op.create_table(
        "grocery_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_grocery_sessions_user_id", "grocery_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_grocery_sessions_user_id", table_name="grocery_sessions")
    op.drop_table("grocery_sessions")
    op.drop_index("ix_trip_bookings_user_id", table_name="trip_bookings")
    op.drop_index("ix_trip_bookings_trip_id", table_name="trip_bookings")
    op.drop_table("trip_bookings")
