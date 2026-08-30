"""store bounded answer and voice quality telemetry

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "j0k1l2m3n4o5"
down_revision: Union[str, None] = "i9j0k1l2m3n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_interactions",
        sa.Column("telemetry", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False, server_default="{}"),
    )
    op.alter_column("knowledge_interactions", "telemetry", server_default=None)


def downgrade() -> None:
    op.drop_column("knowledge_interactions", "telemetry")
