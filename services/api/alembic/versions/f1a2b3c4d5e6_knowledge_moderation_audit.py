"""knowledge editorial moderation audit trail

Revision ID: f1a2b3c4d5e6
Revises: d9f3a7c1e2b4
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "d9f3a7c1e2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("knowledge_entities", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("knowledge_entities", sa.Column("longitude", sa.Float(), nullable=True))
    coordinates = {
        "Red Fort": (28.6562, 77.2410),
        "Humayun's Tomb": (28.5933, 77.2507),
        "Qutb Minar": (28.5244, 77.1855),
        "Taj Mahal": (27.1751, 78.0421),
        "Agra Fort": (27.1795, 78.0211),
        "Fatehpur Sikri": (27.0945, 77.6679),
        "Amber Fort": (26.9855, 75.8513),
        "Jantar Mantar, Jaipur": (26.9248, 75.8246),
        "Walled City of Jaipur": (26.9239, 75.8267),
    }
    for name, (latitude, longitude) in coordinates.items():
        op.execute(
            sa.text(
                "UPDATE knowledge_entities SET latitude = :latitude, longitude = :longitude "
                "WHERE name = :name AND latitude IS NULL"
            ).bindparams(latitude=latitude, longitude=longitude, name=name)
        )
    op.create_table(
        "knowledge_moderation_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("previous_status", sa.String(length=30), nullable=True),
        sa.Column("new_status", sa.String(length=30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_knowledge_moderation_audits_reviewer_id", "knowledge_moderation_audits", ["reviewer_id"])
    op.create_index("ix_knowledge_moderation_audits_target_id", "knowledge_moderation_audits", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_moderation_audits_target_id", table_name="knowledge_moderation_audits")
    op.drop_index("ix_knowledge_moderation_audits_reviewer_id", table_name="knowledge_moderation_audits")
    op.drop_table("knowledge_moderation_audits")
    op.drop_column("knowledge_entities", "longitude")
    op.drop_column("knowledge_entities", "latitude")
