"""persist source fingerprints for operational refresh diffs

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("knowledge_observations", sa.Column("fingerprint", sa.String(length=64), nullable=True))
    op.create_index("ix_knowledge_observations_fingerprint", "knowledge_observations", ["fingerprint"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_knowledge_observations_fingerprint", table_name="knowledge_observations")
    op.drop_column("knowledge_observations", "fingerprint")
