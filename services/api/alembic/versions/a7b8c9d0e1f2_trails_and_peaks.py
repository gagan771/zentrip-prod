"""trail catalog, hazards, offline manifests, and peak lookup data

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "trails",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(length=120), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=False),
        sa.Column("elevation_gain_m", sa.Integer(), nullable=False),
        sa.Column("min_altitude_m", sa.Integer(), nullable=False),
        sa.Column("max_altitude_m", sa.Integer(), nullable=False),
        sa.Column("difficulty", sa.String(length=20), nullable=False),
        sa.Column("seasonality", sa.String(length=200), nullable=False),
        sa.Column("permit_notes", sa.Text(), nullable=True),
        sa.Column("route_geojson", _JSON, nullable=False),
        sa.Column("source_name", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("verification_status", sa.String(length=30), nullable=False),
        sa.Column("last_verified", sa.Date(), nullable=False),
        sa.Column("package_version", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trails_slug", "trails", ["slug"], unique=True)
    op.create_index("ix_trails_region", "trails", ["region"])

    op.create_table(
        "trail_waypoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trail_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trails.id"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("elevation_m", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source_confidence", sa.String(length=20), nullable=False),
    )
    op.create_index("ix_trail_waypoints_trail_id", "trail_waypoints", ["trail_id"])

    op.create_table(
        "trail_hazards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trail_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trails.id"), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("source_kind", sa.String(length=30), nullable=False),
        sa.Column("confidence", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_trail_hazards_trail_id", "trail_hazards", ["trail_id"])

    op.create_table(
        "peaks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("elevation_m", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source_name", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("last_verified", sa.Date(), nullable=False),
    )
    op.create_index("ix_peaks_name", "peaks", ["name"])


def downgrade() -> None:
    op.drop_index("ix_peaks_name", table_name="peaks")
    op.drop_table("peaks")
    op.drop_index("ix_trail_hazards_trail_id", table_name="trail_hazards")
    op.drop_table("trail_hazards")
    op.drop_index("ix_trail_waypoints_trail_id", table_name="trail_waypoints")
    op.drop_table("trail_waypoints")
    op.drop_index("ix_trails_region", table_name="trails")
    op.drop_index("ix_trails_slug", table_name="trails")
    op.drop_table("trails")
