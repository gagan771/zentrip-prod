"""outbound onboarding call state

Revision ID: 8a6f0d3e5b91
Revises: 05ca92d755c3
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "8a6f0d3e5b91"
down_revision: Union[str, None] = "05ca92d755c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "onboarding_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("provider_call_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="queued"),
        sa.Column("question_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("call_consent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("recording_consent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("answers", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_onboarding_calls_provider_call_id", "onboarding_calls", ["provider_call_id"])
    op.create_index("ix_onboarding_calls_user_id", "onboarding_calls", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_onboarding_calls_user_id", table_name="onboarding_calls")
    op.drop_constraint("uq_onboarding_calls_provider_call_id", "onboarding_calls", type_="unique")
    op.drop_table("onboarding_calls")
