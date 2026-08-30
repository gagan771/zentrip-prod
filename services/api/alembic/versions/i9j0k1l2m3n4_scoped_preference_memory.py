"""add scope and confidence to explicit preference memory

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("scope", sa.String(length=20), nullable=False, server_default="long_term"))
    op.add_column("user_preferences", sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"))
    op.alter_column("user_preferences", "scope", server_default=None)
    op.alter_column("user_preferences", "confidence", server_default=None)


def downgrade() -> None:
    op.drop_column("user_preferences", "confidence")
    op.drop_column("user_preferences", "scope")
