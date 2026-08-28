"""structured operational knowledge with freshness and review workflow"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b8e4f6a2c1d0"
down_revision: Union[str, None] = "a9c1e7b3d5f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "knowledge_observations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_sources.id"), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("conflict_key", sa.String(length=100), nullable=False),
        sa.Column("value", _json_type(), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("observed_at", sa.Date(), nullable=False),
        sa.Column("refresh_after", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_knowledge_observations_entity_id", "knowledge_observations", ["entity_id"])
    op.create_index("ix_knowledge_observations_source_id", "knowledge_observations", ["source_id"])
    op.create_index("ix_knowledge_observations_conflict_key", "knowledge_observations", ["conflict_key"])
    op.create_index("ix_knowledge_observations_refresh_after", "knowledge_observations", ["refresh_after"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_observations_refresh_after", table_name="knowledge_observations")
    op.drop_index("ix_knowledge_observations_conflict_key", table_name="knowledge_observations")
    op.drop_index("ix_knowledge_observations_source_id", table_name="knowledge_observations")
    op.drop_index("ix_knowledge_observations_entity_id", table_name="knowledge_observations")
    op.drop_table("knowledge_observations")
