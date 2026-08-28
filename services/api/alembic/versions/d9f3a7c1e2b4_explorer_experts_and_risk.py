"""explorer, destination expert, and risk intelligence workflows

Revision ID: d9f3a7c1e2b4
Revises: c4e8f2a1b6d0
"""

from datetime import date, datetime
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "d9f3a7c1e2b4"
down_revision: Union[str, None] = "c4e8f2a1b6d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_DATE = date(2026, 8, 26)
SEED_DATETIME = datetime(2026, 8, 26)


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=20), nullable=False, server_default="traveler"))
    op.alter_column("users", "role", server_default=None)
    op.create_table(
        "risk_patterns",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("city", sa.String(length=50), nullable=False),
        sa.Column("location_label", sa.String(length=150), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("pattern", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("confidence", sa.String(length=20), nullable=False),
        sa.Column("source_name", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("last_verified", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_risk_patterns_city_category", "risk_patterns", ["city", "category"])

    op.create_table(
        "explorer_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("motivation", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reputation_points", sa.Integer(), nullable=False),
        sa.Column("missions_completed", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "explorer_missions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("city", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("safety_note", sa.Text(), nullable=False),
        sa.Column("required_evidence", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "explorer_submissions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("explorer_id", sa.UUID(), nullable=False),
        sa.Column("mission_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("evidence_url", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["explorer_id"], ["explorer_profiles.id"]),
        sa.ForeignKeyConstraint(["mission_id"], ["explorer_missions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "expert_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("city", sa.String(length=50), nullable=False),
        sa.Column("specialties", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "expert_cases",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("requester_id", sa.UUID(), nullable=False),
        sa.Column("expert_id", sa.UUID(), nullable=True),
        sa.Column("city", sa.String(length=50), nullable=True),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("response", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["requester_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["expert_id"], ["expert_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Seed rows contain JSON arrays. Do not attempt to render those values as
    # PostgreSQL literals during offline SQL generation; online upgrades still
    # execute the seed inserts normally.
    if context.is_offline_mode():
        return

    risk_table = sa.table(
        "risk_patterns",
        sa.column("id", sa.UUID()), sa.column("city", sa.String()), sa.column("location_label", sa.String()),
        sa.column("category", sa.String()), sa.column("pattern", sa.Text()), sa.column("recommendation", sa.Text()),
        sa.column("confidence", sa.String()), sa.column("source_name", sa.String()), sa.column("source_url", sa.String()),
        sa.column("last_verified", sa.Date()), sa.column("status", sa.String()), sa.column("created_at", sa.DateTime()),
    )
    op.bulk_insert(risk_table, [
        {"id": "d1a6b4f0-1c22-4a42-8e0a-000000000001", "city": "Delhi", "location_label": "Major railway station approaches", "category": "unofficial_taxi", "pattern": "Unsolicited drivers may approach arriving travelers and offer rides outside official prepaid or app pickup points.", "recommendation": "Use the official prepaid booth or a booked ride; verify the vehicle plate before entering.", "confidence": "estimated", "source_name": "Zentrip editorial demo seed", "source_url": None, "last_verified": SEED_DATE, "status": "published", "created_at": SEED_DATETIME},
        {"id": "d1a6b4f0-1c22-4a42-8e0a-000000000002", "city": "Agra", "location_label": "Tourist monument entrances", "category": "ticket_solicitation", "pattern": "Unverified intermediaries may offer to arrange entrance tickets or priority access near a monument gate.", "recommendation": "Buy tickets only from the official counter or official website and keep the receipt.", "confidence": "estimated", "source_name": "Zentrip editorial demo seed", "source_url": None, "last_verified": SEED_DATE, "status": "published", "created_at": SEED_DATETIME},
        {"id": "d1a6b4f0-1c22-4a42-8e0a-000000000003", "city": "Jaipur", "location_label": "Busy market lanes", "category": "payment_distraction", "pattern": "Crowded market transactions can create opportunities for payment confusion or pressure to use an unfamiliar QR code.", "recommendation": "Confirm the merchant name and amount on your payment screen; keep a small backup cash amount.", "confidence": "estimated", "source_name": "Zentrip editorial demo seed", "source_url": None, "last_verified": SEED_DATE, "status": "published", "created_at": SEED_DATETIME},
    ])

    mission_table = sa.table(
        "explorer_missions",
        sa.column("id", sa.UUID()), sa.column("title", sa.String()), sa.column("category", sa.String()),
        sa.column("city", sa.String()), sa.column("description", sa.Text()), sa.column("safety_note", sa.Text()),
        sa.column("required_evidence", sa.JSON()), sa.column("status", sa.String()), sa.column("created_at", sa.DateTime()),
    )
    op.bulk_insert(mission_table, [
        {"id": "d1a6b4f0-1c22-4a42-8e0a-000000000101", "title": "Verify a heritage access point", "category": "accessibility", "city": "Delhi", "description": "Record whether the selected public entrance has visible signage, step-free access, and opening information.", "safety_note": "Do this during daylight and never enter a restricted area.", "required_evidence": ["short_note", "gps", "optional_photo"], "status": "published", "created_at": SEED_DATETIME},
        {"id": "d1a6b4f0-1c22-4a42-8e0a-000000000102", "title": "Confirm a community event venue", "category": "event", "city": "Agra", "description": "Check that the venue name and meeting point for a listed community event are accurate.", "safety_note": "Do not approach a venue alone at night; public verification is enough.", "required_evidence": ["short_note", "gps", "optional_photo"], "status": "published", "created_at": SEED_DATETIME},
        {"id": "d1a6b4f0-1c22-4a42-8e0a-000000000103", "title": "Review a hostel common area", "category": "stay", "city": "Jaipur", "description": "Submit an honest, non-identifying note about social space, quiet hours, and accessibility.", "safety_note": "Do not photograph guests or private areas; ask staff before taking any image.", "required_evidence": ["short_note", "gps"], "status": "published", "created_at": SEED_DATETIME},
    ])


def downgrade() -> None:
    op.drop_table("expert_cases")
    op.drop_table("expert_profiles")
    op.drop_table("explorer_submissions")
    op.drop_table("explorer_missions")
    op.drop_table("explorer_profiles")
    op.drop_index("ix_risk_patterns_city_category", table_name="risk_patterns")
    op.drop_table("risk_patterns")
