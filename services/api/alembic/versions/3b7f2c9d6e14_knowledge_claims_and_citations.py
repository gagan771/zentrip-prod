"""knowledge claims and citations

Revision ID: 3b7f2c9d6e14
Revises: 1c4d9e2a7f30
"""

import uuid
from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "3b7f2c9d6e14"
down_revision: Union[str, None] = "1c4d9e2a7f30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_entities",
        sa.Column("entity_type", sa.String(length=50), nullable=False, server_default="place"),
    )
    op.add_column(
        "knowledge_entities",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
    )

    op.create_table(
        "knowledge_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("source_type", sa.String(length=30), nullable=False),
        sa.Column("authority_level", sa.String(length=20), nullable=False),
        sa.Column("license_note", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "knowledge_claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_sources.id"), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("source_locator", sa.String(length=500), nullable=True),
        sa.Column("confidence", sa.String(length=20), nullable=False),
        sa.Column("verification_status", sa.String(length=20), nullable=False),
        sa.Column("last_verified", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_knowledge_claims_entity_id", "knowledge_claims", ["entity_id"])
    op.create_index("ix_knowledge_claims_source_id", "knowledge_claims", ["source_id"])
    op.create_index("ix_knowledge_claims_status", "knowledge_claims", ["verification_status", "language"])
    op.create_table(
        "knowledge_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("alias", sa.String(length=200), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
    )
    op.create_index("ix_knowledge_aliases_alias", "knowledge_aliases", ["alias"])
    op.create_index("ix_knowledge_aliases_entity_id", "knowledge_aliases", ["entity_id"])

    # Offline SQL is used in this workspace to validate migration ordering. It can
    # emit the schema DDL but cannot read legacy rows; a real database upgrade runs
    # the backfill below inside the same transaction.
    if context.is_offline_mode():
        return

    # Preserve the Phase 1 facts as first-class claims. Entries without a source URL
    # are retained for editorial follow-up but deliberately not published to Zenny.
    bind = op.get_bind()
    legacy = bind.execute(
        sa.text(
            "SELECT id, fact, source, source_url, confidence, last_verified "
            "FROM knowledge_entities"
        )
    ).mappings()
    sources: dict[tuple[str, str | None], uuid.UUID] = {}
    now = datetime.utcnow()
    for row in legacy:
        source_key = (row["source"], row["source_url"])
        source_id = sources.get(source_key)
        if source_id is None:
            source_id = uuid.uuid4()
            sources[source_key] = source_id
            bind.execute(
                sa.text(
                    "INSERT INTO knowledge_sources "
                    "(id, name, source_url, source_type, authority_level, status, created_at) "
                    "VALUES (:id, :name, :source_url, 'official', 'primary', 'active', :created_at)"
                ),
                {
                    "id": source_id,
                    "name": row["source"],
                    "source_url": row["source_url"],
                    "created_at": now,
                },
            )
        verification_status = "published" if row["source_url"] else "needs_review"
        bind.execute(
            sa.text(
                "INSERT INTO knowledge_claims "
                "(id, entity_id, source_id, claim, language, confidence, verification_status, "
                "last_verified, created_at, updated_at) "
                "VALUES (:id, :entity_id, :source_id, :claim, 'en', :confidence, :status, "
                ":last_verified, :created_at, :updated_at)"
            ),
            {
                "id": uuid.uuid4(),
                "entity_id": row["id"],
                "source_id": source_id,
                "claim": row["fact"],
                "confidence": row["confidence"],
                "status": verification_status,
                "last_verified": row["last_verified"],
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    op.drop_index("ix_knowledge_aliases_entity_id", table_name="knowledge_aliases")
    op.drop_index("ix_knowledge_aliases_alias", table_name="knowledge_aliases")
    op.drop_table("knowledge_aliases")
    op.drop_index("ix_knowledge_claims_status", table_name="knowledge_claims")
    op.drop_index("ix_knowledge_claims_source_id", table_name="knowledge_claims")
    op.drop_index("ix_knowledge_claims_entity_id", table_name="knowledge_claims")
    op.drop_table("knowledge_claims")
    op.drop_table("knowledge_sources")
    op.drop_column("knowledge_entities", "status")
    op.drop_column("knowledge_entities", "entity_type")
