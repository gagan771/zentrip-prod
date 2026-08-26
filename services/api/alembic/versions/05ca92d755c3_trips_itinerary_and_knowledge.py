"""trips, itinerary_days, knowledge_entities

Revision ID: 05ca92d755c3
Revises: 740b14ac801e
Create Date: 2026-08-26

Hand-written for the same reason as the initial migration — no Postgres reachable
in the sandbox this was built in. Verify with `alembic upgrade head` once Postgres
is available (see services/api/README.md); autogenerate for everything after this.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "05ca92d755c3"
down_revision: Union[str, None] = "740b14ac801e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("origin_country", sa.String(2), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("cities", postgresql.JSONB(), nullable=False),
        sa.Column("budget_level", sa.String(20), nullable=False, server_default="backpacker"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "itinerary_days",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("activities", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_itinerary_days_trip_id", "itinerary_days", ["trip_id"])

    op.create_table(
        "knowledge_entities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("fact", sa.Text(), nullable=False),
        sa.Column("source", sa.String(200), nullable=False),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("confidence", sa.String(20), nullable=False, server_default="verified"),
        sa.Column("last_verified", sa.Date(), nullable=False),
    )
    op.create_index("ix_knowledge_entities_city", "knowledge_entities", ["city"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_entities_city", table_name="knowledge_entities")
    op.drop_table("knowledge_entities")
    op.drop_index("ix_itinerary_days_trip_id", table_name="itinerary_days")
    op.drop_table("itinerary_days")
    op.drop_table("trips")
