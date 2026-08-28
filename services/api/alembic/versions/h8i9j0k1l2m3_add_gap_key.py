"""add deterministic intent-scoped key to knowledge gaps

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, None] = "g7h8i9j0k1l2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("knowledge_gaps", sa.Column("gap_key", sa.String(length=540), nullable=True))
    op.execute("UPDATE knowledge_gaps SET gap_key = LEFT(intent || ':' || normalized_query, 540)")
    op.alter_column("knowledge_gaps", "gap_key", nullable=False)
    op.create_index("ix_knowledge_gaps_gap_key", "knowledge_gaps", ["gap_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_knowledge_gaps_gap_key", table_name="knowledge_gaps")
    op.drop_column("knowledge_gaps", "gap_key")
