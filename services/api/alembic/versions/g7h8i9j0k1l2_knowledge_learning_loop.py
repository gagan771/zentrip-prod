"""knowledge interaction telemetry and recurring gap queue

Revision ID: g7h8i9j0k1l2
Revises: c1f7a9d3e5b2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, None] = "c1f7a9d3e5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knowledge_interactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_id", sa.String(length=120), nullable=True),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("normalized_query", sa.String(length=500), nullable=False),
        sa.Column("intent", sa.String(length=30), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("citation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("answer_confidence", sa.String(length=20), nullable=False),
        sa.Column("outcome", sa.String(length=30), nullable=False),
        sa.Column("feedback", sa.String(length=20), nullable=True),
        sa.Column("feedback_note", sa.Text(), nullable=True),
        sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_knowledge_interactions_user_id", "knowledge_interactions", ["user_id"])
    op.create_index("ix_knowledge_interactions_normalized_query", "knowledge_interactions", ["normalized_query"])
    op.create_index("ix_knowledge_interactions_intent", "knowledge_interactions", ["intent"])
    op.create_index("ix_knowledge_interactions_outcome", "knowledge_interactions", ["outcome"])
    op.create_index("ix_knowledge_interactions_created_at", "knowledge_interactions", ["created_at"])

    op.create_table(
        "knowledge_gaps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gap_key", sa.String(length=540), nullable=False),
        sa.Column("normalized_query", sa.String(length=500), nullable=False),
        sa.Column("example_query", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(length=30), nullable=False),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("no_match_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("negative_feedback_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("gap_key", name="uq_knowledge_gaps_gap_key"),
    )
    op.create_index("ix_knowledge_gaps_normalized_query", "knowledge_gaps", ["normalized_query"])
    op.create_index("ix_knowledge_gaps_priority", "knowledge_gaps", ["priority"])
    op.create_index("ix_knowledge_gaps_status", "knowledge_gaps", ["status"])
    op.create_index("ix_knowledge_gaps_last_seen_at", "knowledge_gaps", ["last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_gaps_last_seen_at", table_name="knowledge_gaps")
    op.drop_index("ix_knowledge_gaps_status", table_name="knowledge_gaps")
    op.drop_index("ix_knowledge_gaps_priority", table_name="knowledge_gaps")
    op.drop_index("ix_knowledge_gaps_normalized_query", table_name="knowledge_gaps")
    op.drop_table("knowledge_gaps")
    op.drop_index("ix_knowledge_interactions_created_at", table_name="knowledge_interactions")
    op.drop_index("ix_knowledge_interactions_outcome", table_name="knowledge_interactions")
    op.drop_index("ix_knowledge_interactions_intent", table_name="knowledge_interactions")
    op.drop_index("ix_knowledge_interactions_normalized_query", table_name="knowledge_interactions")
    op.drop_index("ix_knowledge_interactions_user_id", table_name="knowledge_interactions")
    op.drop_table("knowledge_interactions")
