"""normalized pan-India destination profiles and route edges"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c1f7a9d3e5b2"
down_revision: Union[str, None] = "b8e4f6a2c1d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "destination_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("state", sa.String(length=100), nullable=False),
        sa.Column("region", sa.String(length=50), nullable=False),
        sa.Column("destination_kind", sa.String(length=40), nullable=False),
        sa.Column("tags", _json_type(), nullable=False),
        sa.Column("best_seasons", _json_type(), nullable=False),
        sa.Column("typical_stay_min_days", sa.Integer(), nullable=False),
        sa.Column("typical_stay_max_days", sa.Integer(), nullable=False),
        sa.Column("altitude_m", sa.Integer(), nullable=True),
        sa.Column("gateway_city", sa.String(length=100), nullable=True),
        sa.Column("gateway_airports", _json_type(), nullable=False),
        sa.Column("access_notes", sa.Text(), nullable=True),
        sa.Column("safety_notes", sa.Text(), nullable=True),
        sa.Column("accessibility", _json_type(), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_sources.id"), nullable=False),
        sa.Column("last_verified", sa.Date(), nullable=False),
        sa.Column("refresh_after", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("entity_id", name="uq_destination_profiles_entity_id"),
    )
    op.create_index("ix_destination_profiles_entity_id", "destination_profiles", ["entity_id"], unique=True)
    op.create_index("ix_destination_profiles_region", "destination_profiles", ["region"])
    op.create_index("ix_destination_profiles_refresh_after", "destination_profiles", ["refresh_after"])

    op.create_table(
        "destination_routes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("origin_entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("destination_entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("mode", sa.String(length=30), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("typical_min_minutes", sa.Integer(), nullable=False),
        sa.Column("typical_max_minutes", sa.Integer(), nullable=False),
        sa.Column("season_notes", sa.Text(), nullable=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_sources.id"), nullable=False),
        sa.Column("observed_at", sa.Date(), nullable=False),
        sa.Column("refresh_after", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_destination_routes_origin_entity_id", "destination_routes", ["origin_entity_id"])
    op.create_index("ix_destination_routes_destination_entity_id", "destination_routes", ["destination_entity_id"])
    op.create_index("ix_destination_routes_refresh_after", "destination_routes", ["refresh_after"])


def downgrade() -> None:
    op.drop_index("ix_destination_routes_refresh_after", table_name="destination_routes")
    op.drop_index("ix_destination_routes_destination_entity_id", table_name="destination_routes")
    op.drop_index("ix_destination_routes_origin_entity_id", table_name="destination_routes")
    op.drop_table("destination_routes")
    op.drop_index("ix_destination_profiles_refresh_after", table_name="destination_profiles")
    op.drop_index("ix_destination_profiles_region", table_name="destination_profiles")
    op.drop_index("ix_destination_profiles_entity_id", table_name="destination_profiles")
    op.drop_table("destination_profiles")
