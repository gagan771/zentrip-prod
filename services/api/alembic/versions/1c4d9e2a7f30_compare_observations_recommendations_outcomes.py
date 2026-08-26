"""comparison observations, recommendations, and outcomes

Revision ID: 1c4d9e2a7f30
Revises: 8a6f0d3e5b91
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1c4d9e2a7f30"
down_revision: Union[str, None] = "8a6f0d3e5b91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "provider_observations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("mode", sa.String(30), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("origin", sa.String(20), nullable=False),
        sa.Column("destination", sa.String(20), nullable=False),
        sa.Column("departure_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("arrival_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("base_price", sa.Integer(), nullable=False),
        sa.Column("fees", sa.Integer(), nullable=False),
        sa.Column("total_price", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("cancellation_score", sa.Float(), nullable=False),
        sa.Column("reliability_score", sa.Float(), nullable=False),
        sa.Column("convenience_score", sa.Float(), nullable=False),
        sa.Column("availability", sa.Boolean(), nullable=False),
        sa.Column("source_kind", sa.String(20), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_provider_observations_user_id", "provider_observations", ["user_id"])
    op.create_index("ix_provider_observations_route", "provider_observations", ["origin", "destination"])

    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("observation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("provider_observations.id"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("reasons", postgresql.JSONB(), nullable=False),
        sa.Column("freshness", sa.String(20), nullable=False),
        sa.Column("bookable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recommendations_user_id", "recommendations", ["user_id"])
    op.create_index("ix_recommendations_observation_id", "recommendations", ["observation_id"])

    op.create_table(
        "outcomes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recommendation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recommendations.id"), nullable=False),
        sa.Column("outcome_type", sa.String(30), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_outcomes_user_id", "outcomes", ["user_id"])
    op.create_index("ix_outcomes_recommendation_id", "outcomes", ["recommendation_id"])


def downgrade() -> None:
    op.drop_index("ix_outcomes_recommendation_id", table_name="outcomes")
    op.drop_index("ix_outcomes_user_id", table_name="outcomes")
    op.drop_table("outcomes")
    op.drop_index("ix_recommendations_observation_id", table_name="recommendations")
    op.drop_index("ix_recommendations_user_id", table_name="recommendations")
    op.drop_table("recommendations")
    op.drop_index("ix_provider_observations_route", table_name="provider_observations")
    op.drop_index("ix_provider_observations_user_id", table_name="provider_observations")
    op.drop_table("provider_observations")
