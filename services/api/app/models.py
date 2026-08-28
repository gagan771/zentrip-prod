import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# JSONB on Postgres, plain JSON elsewhere (e.g. SQLite in tests) — same pattern as the
# naive-UTC datetime convention: pick something that behaves the same on every backend
# this app might run against, per app/db.py's dialect-agnostic intent.
_JSON = JSON().with_variant(JSONB(), "postgresql")


def _now() -> datetime:
    # Naive UTC on purpose: SQLAlchemy round-trips DateTime(timezone=True) as
    # tz-naive on SQLite (and some drivers), so every persisted timestamp in this
    # app is naive UTC by convention — comparisons must use the same convention,
    # not datetime.now(timezone.utc). See app/security.py.
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Nullable: a Google-only account never sets a password.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Google's stable per-account "sub" claim — nullable: an email/password-only account has none.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="traveler", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    """
    Refresh tokens are opaque random strings, not JWTs — we store only a hash so a
    leaked DB row can't be replayed, and so a token can be revoked (logout, password
    change) without needing a JWT blocklist. Access tokens stay short-lived JWTs.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class GuardianIncident(Base):
    """Deterministic Guardian incident state, never decided by an LLM."""

    __tablename__ = "guardian_incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="created", nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    shared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class Trip(Base):
    """Per 02-ai-trip-planner.md / master spec §41 `Trip` entity — kept deliberately
    minimal for Phase 1: enough to generate and store an itinerary, not the full
    booking/DestinationStay model (that's Phase 2, `04-journey-booking-hub.md`)."""

    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    origin_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    # e.g. ["Delhi", "Agra", "Jaipur"] — the corridor-MVP example from 00-engineering-phase-roadmap.md.
    cities: Mapped[list[str]] = mapped_column(_JSON, nullable=False)
    budget_level: Mapped[str] = mapped_column(String(20), default="backpacker", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft|planned|active|completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    days: Mapped[list["ItineraryDay"]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    bookings: Mapped[list["TripBooking"]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    plans: Mapped[list["ItineraryPlan"]] = relationship(back_populates="trip", cascade="all, delete-orphan")


class TravelerProfile(Base):
    """Structured, user-controlled experience preferences used by the planner."""

    __tablename__ = "traveler_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, index=True, nullable=False)
    preferences: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ItineraryPlan(Base):
    """Immutable-ish versioned adaptive plan; legacy itinerary_days mirrors the latest plan."""

    __tablename__ = "itinerary_plans"
    __table_args__ = (UniqueConstraint("trip_id", "version", name="uq_itinerary_plans_trip_version"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    model: Mapped[str] = mapped_column(String(150), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), default="adaptive-v1", nullable=False)
    days: Mapped[list[dict]] = mapped_column(_JSON, nullable=False)
    preferences_snapshot: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    source_claim_ids: Mapped[list[str]] = mapped_column(_JSON, nullable=False, default=list)
    validation: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    trip: Mapped[Trip] = relationship(back_populates="plans")


class ItineraryFeedback(Base):
    """A user/staff decision on a generated plan item, retained for ranking data."""

    __tablename__ = "itinerary_feedback"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("itinerary_plans.id"), nullable=False, index=True)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    item_key: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    replacement_place_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    details: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    actor: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class EditorialRule(Base):
    """Staff-approved operational guidance that can influence future plans."""

    __tablename__ = "editorial_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    scope: Mapped[str] = mapped_column(String(100), default="India", nullable=False)
    condition: Mapped[str] = mapped_column(String(500), nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="needs_review", nullable=False)
    source_feedback_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("itinerary_feedback.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class PlannerRun(Base):
    """Traceability record for retrieval, model, validation, and fallback behavior."""

    __tablename__ = "planner_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False, index=True)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("itinerary_plans.id"), nullable=True, index=True)
    model: Mapped[str] = mapped_column(String(150), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    retrieval_ids: Mapped[list[str]] = mapped_column(_JSON, nullable=False, default=list)
    validation_passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class ItineraryDay(Base):
    """Matches the itinerary object schema in 02-ai-trip-planner.md §5 / master spec §9.3 —
    `activities` is stored as the same JSON shape the client already renders, so there's
    no reshaping between what Claude returns, what's persisted, and what the app displays."""

    __tablename__ = "itinerary_days"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    # [{start_time, place_id, place_name, duration_minutes, reason, booking_required, status}, ...]
    activities: Mapped[list[dict]] = mapped_column(_JSON, nullable=False)

    trip: Mapped[Trip] = relationship(back_populates="days")


class TripBooking(Base):
    """A user-owned booking/handoff record shown on the Journey timeline."""

    __tablename__ = "trip_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="confirmed")
    deep_link: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    trip: Mapped[Trip] = relationship(back_populates="bookings")


class KnowledgeEntity(Base):
    """Text-only Knowledge Base per 07-historical-cultural-guide.md — Phase 1 scope is
    exactly this: fact + source + confidence, no camera/landmark identification yet.
    Every field the spec requires (§18) is here so this table doesn't need reshaping
    once RAG/vector retrieval (pgvector) is added on top of it later."""

    __tablename__ = "knowledge_entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    fact: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[str] = mapped_column(String(20), default="verified", nullable=False)
    last_verified: Mapped[date] = mapped_column(Date, nullable=False)
    # Structured experience signals used by the adaptive planner. Claims remain the
    # factual source; this profile only describes fit, effort, timing, and booking.
    experience_profile: Mapped[dict | None] = mapped_column(_JSON, nullable=True)
    # The legacy fields above remain as a concise itinerary-planning summary. New
    # Guide answers are built from the claim/source tables below, so every sentence
    # returned to a traveler can carry a specific citation.
    entity_type: Mapped[str] = mapped_column(String(50), default="place", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)


class KnowledgeSource(Base):
    """A publisher or primary source used by one or more KnowledgeClaims.

    Source records deliberately store provenance, not scraped page bodies. Editors
    write short factual claims from permitted source material and can later replace
    or retire a source without losing the entity's audit trail.
    """

    __tablename__ = "knowledge_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), default="official", nullable=False)
    authority_level: Mapped[str] = mapped_column(String(20), default="primary", nullable=False)
    license_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class KnowledgeClaim(Base):
    """One publishable fact about a KnowledgeEntity with its own citation.

    Claims, rather than long copied articles, are the retrieval unit for Zenny. A
    claim can be reviewed or withdrawn independently when its source changes.
    """

    __tablename__ = "knowledge_claims"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_sources.id"), nullable=False)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    source_locator: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[str] = mapped_column(String(20), default="verified", nullable=False)
    verification_status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)
    last_verified: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class KnowledgeObservation(Base):
    """Fresh, structured operational data attached to a place.

    Unlike historical claims, hours, ticket links, and ratings expire quickly and
    may disagree across sources. Observations therefore have an explicit refresh
    date, conflict key, and staff review status.
    """

    __tablename__ = "knowledge_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False, index=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_sources.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # hours|ticketing|rating|activity
    conflict_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    value: Mapped[dict] = mapped_column(_JSON, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    observed_at: Mapped[date] = mapped_column(Date, nullable=False)
    refresh_after: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="needs_review", nullable=False)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class DestinationProfile(Base):
    """Normalized planning metadata for a destination or experience anchor."""

    __tablename__ = "destination_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), unique=True, index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    destination_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    tags: Mapped[list[str]] = mapped_column(_JSON, nullable=False, default=list)
    best_seasons: Mapped[list[str]] = mapped_column(_JSON, nullable=False, default=list)
    typical_stay_min_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    typical_stay_max_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    altitude_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gateway_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gateway_airports: Mapped[list[str]] = mapped_column(_JSON, nullable=False, default=list)
    access_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessibility: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_sources.id"), nullable=False)
    last_verified: Mapped[date] = mapped_column(Date, nullable=False)
    refresh_after: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class DestinationRoute(Base):
    """Estimated route edge used for transfer-aware itinerary planning."""

    __tablename__ = "destination_routes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    origin_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False, index=True)
    destination_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(30), nullable=False)  # road|rail|air|ferry|mixed
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    typical_min_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    typical_max_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    season_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_sources.id"), nullable=False)
    observed_at: Mapped[date] = mapped_column(Date, nullable=False)
    refresh_after: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class KnowledgeAlias(Base):
    """Alternate spellings/names used to resolve a traveler query to an entity."""

    __tablename__ = "knowledge_aliases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_entities.id"), nullable=False)
    alias: Mapped[str] = mapped_column(String(200), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)


class KnowledgeModerationAudit(Base):
    """Immutable audit record for staff edits to citation-first knowledge content."""

    __tablename__ = "knowledge_moderation_audits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class Trail(Base):
    """Offline trail catalog entry; preview routes are never treated as navigation-ready."""

    __tablename__ = "trails"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_gain_m: Mapped[int] = mapped_column(Integer, nullable=False)
    min_altitude_m: Mapped[int] = mapped_column(Integer, nullable=False)
    max_altitude_m: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False)
    seasonality: Mapped[str] = mapped_column(String(200), nullable=False)
    permit_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_geojson: Mapped[dict] = mapped_column(_JSON, nullable=False)
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(30), default="preview", nullable=False)
    last_verified: Mapped[date] = mapped_column(Date, nullable=False)
    package_version: Mapped[str] = mapped_column(String(30), default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class TrailWaypoint(Base):
    __tablename__ = "trail_waypoints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trail_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trails.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_confidence: Mapped[str] = mapped_column(String(20), default="estimated", nullable=False)


class TrailHazard(Base):
    __tablename__ = "trail_hazards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trail_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trails.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_kind: Mapped[str] = mapped_column(String(30), nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Peak(Base):
    __tablename__ = "peaks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    elevation_m: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="preview", nullable=False)
    last_verified: Mapped[date] = mapped_column(Date, nullable=False)


class TripMemoryNote(Base):
    """Trip memory tier per 01-zentrip-companion.md §3 — short facts scoped to one
    trip ("staying in Udaipur until Friday," "already visited City Palace"), distinct
    from session memory (Redis, cleared per chat) and long-term preference memory
    (below, persists across trips). Deliberately a flat append-only note log, not a
    key/value store — the Companion's Context Builder reads recent notes back in,
    it doesn't need to update them in place."""

    __tablename__ = "trip_memory_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    note: Mapped[str] = mapped_column(String(500), nullable=False)
    # Who/what produced this note — lets the Context Builder distinguish deterministic
    # system bookkeeping (e.g. "itinerary regenerated") from a user-authored note, without
    # needing a separate table.
    source: Mapped[str] = mapped_column(String(20), default="system", nullable=False)  # system|user
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class UserPreference(Base):
    """Long-term preference memory tier per 01-zentrip-companion.md §3 ("prefers hostels,"
    "usually prefers trains over flights") — persists across trips, written only after
    explicit opt-in (never inferred silently from a casual chat message, per the same
    spec section). Versioned via soft-delete (`superseded_at`) rather than hard delete
    so a user can view what Zentrip remembered about them and when, per privacy §50."""

    __tablename__ = "user_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    statement: Mapped[str] = mapped_column(String(500), nullable=False)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class OnboardingCall(Base):
    """A consented outbound onboarding call and its small, privacy-conscious state.

    Raw answers are retained only as the call's onboarding transcript fragments for now;
    a later preference extraction job can turn them into Trip memory after the caller is
    linked to an account. Recording is never enabled by default.
    """

    __tablename__ = "onboarding_calls"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_call_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", nullable=False)
    question_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    call_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recording_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    answers: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class GrocerySession(Base):
    """Saved provider hand-off state, scoped to the traveler who opened it."""

    __tablename__ = "grocery_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    items: Mapped[list[dict]] = mapped_column(_JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class ProviderObservation(Base):
    """One normalized provider result, retained for transparent comparison history.

    `source_kind` is intentionally explicit. A mock or historical observation may help
    rank options, but it must never be presented as a live, bookable price.
    """

    __tablename__ = "provider_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    mode: Mapped[str] = mapped_column(String(30), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    origin: Mapped[str] = mapped_column(String(20), nullable=False)
    destination: Mapped[str] = mapped_column(String(20), nullable=False)
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arrival_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    base_price: Mapped[int] = mapped_column(Integer, nullable=False)
    fees: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cancellation_score: Mapped[float] = mapped_column(Float, nullable=False)
    reliability_score: Mapped[float] = mapped_column(Float, nullable=False)
    convenience_score: Mapped[float] = mapped_column(Float, nullable=False)
    availability: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source_kind: Mapped[str] = mapped_column(String(20), nullable=False)  # mock|historical|live
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class StayObservation(Base):
    """Stay/hostel/hotel equivalent of ProviderObservation, per 03-compare-decision-engine.md
    §3's Comparison Data Flywheel — kept as its own table rather than overloading the
    transport-shaped one above: a stay has no origin/destination/duration, and forcing
    check-in/check-out into departure_at/arrival_at would make every transport query
    that reads this table need to filter stays back out."""

    __tablename__ = "stay_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    stay_type: Mapped[str] = mapped_column(String(20), nullable=False)  # hostel|hotel
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(20), nullable=False)
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    price_per_night: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)
    rating: Mapped[float] = mapped_column(Float, nullable=False)  # 0-5
    distance_to_center_km: Mapped[float] = mapped_column(Float, nullable=False)
    cancellation_score: Mapped[float] = mapped_column(Float, nullable=False)
    availability: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source_kind: Mapped[str] = mapped_column(String(20), nullable=False)  # mock|historical|live
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class StayRecommendation(Base):
    """Stay equivalent of Recommendation — see StayObservation for why it's a separate
    table rather than reusing Recommendation.observation_id's FK to provider_observations.
    Deliberately has no Outcome-tracking counterpart yet; "basic stay search" is the
    Phase 2 exit criterion, not the full booked/cancelled flywheel for stays."""

    __tablename__ = "stay_recommendations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    observation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stay_observations.id"), nullable=False
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    reasons: Mapped[list[str]] = mapped_column(_JSON, nullable=False)
    freshness: Mapped[str] = mapped_column(String(20), nullable=False)  # estimated|live|verified
    bookable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class Recommendation(Base):
    """An explainable ranked choice tied to the observation that produced it."""

    __tablename__ = "recommendations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    observation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("provider_observations.id"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    reasons: Mapped[list[str]] = mapped_column(_JSON, nullable=False)
    freshness: Mapped[str] = mapped_column(String(20), nullable=False)  # estimated|live|verified
    bookable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class Outcome(Base):
    """Records what happened after a recommendation for the later ranking flywheel."""

    __tablename__ = "outcomes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    recommendation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recommendations.id"), nullable=False
    )
    outcome_type: Mapped[str] = mapped_column(String(30), nullable=False)  # opened|selected|booked|dismissed
    details: Mapped[dict] = mapped_column(_JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class RiskPattern(Base):
    """Pattern-based, sourced risk information; never a named-person accusation."""

    __tablename__ = "risk_patterns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    location_label: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False)
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    last_verified: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class ExplorerProfile(Base):
    __tablename__ = "explorer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    motivation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), default="applicant", nullable=False)
    reputation_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    missions_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ExplorerMission(Base):
    __tablename__ = "explorer_missions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    safety_note: Mapped[str] = mapped_column(Text, nullable=False)
    required_evidence: Mapped[list] = mapped_column(_JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), default="published", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class ExplorerSubmission(Base):
    __tablename__ = "explorer_submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    explorer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("explorer_profiles.id"), nullable=False)
    mission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("explorer_missions.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="submitted", nullable=False)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class ExpertProfile(Base):
    __tablename__ = "expert_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    specialties: Mapped[list] = mapped_column(_JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), default="applicant", nullable=False)
    rating: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class ExpertCase(Base):
    __tablename__ = "expert_cases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expert_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expert_profiles.id"), nullable=True)
    city: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="waiting", nullable=False)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class BuddyWaitlistRequest(Base):
    """Traveler join/waitlist intent for a demo group — no chat until mutual consent (spec 10)."""

    __tablename__ = "buddy_waitlist_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    group_id: Mapped[str] = mapped_column(String(80), nullable=False)
    group_name: Mapped[str] = mapped_column(String(200), nullable=False)
    request_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)  # queued|notified|withdrawn
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class BuddyPairConsent(Base):
    """Two queued travelers on the same group. Chat unlocks only after both sides consent."""

    __tablename__ = "buddy_pair_consents"
    __table_args__ = (UniqueConstraint("group_id", "user_low_id", "user_high_id", name="uq_buddy_pair_group_users"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    user_low_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    user_high_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    low_consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    high_consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class BuddyMessage(Base):
    __tablename__ = "buddy_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pair_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("buddy_pair_consents.id"), nullable=False, index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
