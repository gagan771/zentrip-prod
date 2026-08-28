"""adaptive itinerary plans, traveler profiles, and feedback learning data"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a9c1e7b3d5f0"
down_revision: Union[str, None] = "f3c5d7e9a0b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("knowledge_entities", sa.Column("experience_profile", _json_type(), nullable=True))

    op.create_table(
        "traveler_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("preferences", _json_type(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_traveler_profiles_user_id"),
    )
    op.create_index("ix_traveler_profiles_user_id", "traveler_profiles", ["user_id"], unique=True)

    op.create_table(
        "itinerary_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("model", sa.String(length=150), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("days", _json_type(), nullable=False),
        sa.Column("preferences_snapshot", _json_type(), nullable=False),
        sa.Column("source_claim_ids", _json_type(), nullable=False),
        sa.Column("validation", _json_type(), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("trip_id", "version", name="uq_itinerary_plans_trip_version"),
    )
    op.create_index("ix_itinerary_plans_trip_id", "itinerary_plans", ["trip_id"], unique=False)

    op.create_table(
        "itinerary_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("itinerary_plans.id"), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("item_key", sa.String(length=200), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("replacement_place_id", sa.String(length=100), nullable=True),
        sa.Column("details", _json_type(), nullable=False),
        sa.Column("actor", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_itinerary_feedback_plan_id", "itinerary_feedback", ["plan_id"], unique=False)
    op.create_index("ix_itinerary_feedback_trip_id", "itinerary_feedback", ["trip_id"], unique=False)
    op.create_index("ix_itinerary_feedback_user_id", "itinerary_feedback", ["user_id"], unique=False)

    op.create_table(
        "editorial_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scope", sa.String(length=100), nullable=False),
        sa.Column("condition", sa.String(length=500), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("source_feedback_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("itinerary_feedback.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "planner_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("itinerary_plans.id"), nullable=True),
        sa.Column("model", sa.String(length=150), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("retrieval_ids", _json_type(), nullable=False),
        sa.Column("validation_passed", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_planner_runs_trip_id", "planner_runs", ["trip_id"], unique=False)
    op.create_index("ix_planner_runs_plan_id", "planner_runs", ["plan_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_planner_runs_plan_id", table_name="planner_runs")
    op.drop_index("ix_planner_runs_trip_id", table_name="planner_runs")
    op.drop_table("planner_runs")
    op.drop_table("editorial_rules")
    op.drop_index("ix_itinerary_feedback_user_id", table_name="itinerary_feedback")
    op.drop_index("ix_itinerary_feedback_trip_id", table_name="itinerary_feedback")
    op.drop_index("ix_itinerary_feedback_plan_id", table_name="itinerary_feedback")
    op.drop_table("itinerary_feedback")
    op.drop_index("ix_itinerary_plans_trip_id", table_name="itinerary_plans")
    op.drop_table("itinerary_plans")
    op.drop_index("ix_traveler_profiles_user_id", table_name="traveler_profiles")
    op.drop_table("traveler_profiles")
    op.drop_column("knowledge_entities", "experience_profile")
