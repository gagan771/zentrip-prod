import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    idToken: str


class RefreshRequest(BaseModel):
    refreshToken: str


class LogoutRequest(BaseModel):
    refreshToken: str


class TokenResponse(BaseModel):
    accessToken: str
    refreshToken: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    language: str
    country: str | None = None

    model_config = {"from_attributes": True}


class TripCreate(BaseModel):
    originCountry: str | None = Field(default=None, max_length=2)
    startDate: date
    endDate: date
    cities: list[str] = Field(min_length=1, max_length=20)
    budgetLevel: str = Field(default="backpacker", pattern="^(backpacker|comfort|luxury|mixed)$")


class TripOut(BaseModel):
    id: uuid.UUID
    originCountry: str | None
    startDate: date
    endDate: date
    cities: list[str]
    budgetLevel: str
    status: str


class TravelerProfileInput(BaseModel):
    interests: list[str] = Field(default_factory=list, max_length=20)
    pace: str = Field(default="balanced", pattern="^(relaxed|balanced|packed)$")
    transportPreferences: list[str] = Field(default_factory=list, max_length=10)
    walkingTolerance: str = Field(default="medium", pattern="^(low|medium|high)$")
    wakeTime: str = Field(default="08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    sleepTime: str = Field(default="22:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    travelParty: str = Field(default="solo", pattern="^(solo|couple|family|group)$")
    accessibility: list[str] = Field(default_factory=list, max_length=10)
    foodPreferences: list[str] = Field(default_factory=list, max_length=20)


class TravelerProfileOut(TravelerProfileInput):
    updatedAt: datetime


class TripConstraintsInput(BaseModel):
    maxActivitiesPerDay: int = Field(default=3, ge=1, le=8)
    maxDailyTravelMinutes: int = Field(default=240, ge=0, le=960)
    dailyBudget: int | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    avoid: list[str] = Field(default_factory=list, max_length=20)
    mustInclude: list[str] = Field(default_factory=list, max_length=20)


class AdaptivePlanCreate(BaseModel):
    profile: TravelerProfileInput | None = None
    constraints: TripConstraintsInput = Field(default_factory=TripConstraintsInput)


class ItineraryFeedbackCreate(BaseModel):
    itemKey: str = Field(min_length=1, max_length=200)
    action: str = Field(pattern="^(accept|reject|replace|reschedule|complete|comment)$")
    reason: str | None = Field(default=None, max_length=500)
    replacementPlaceId: str | None = Field(default=None, max_length=100)
    details: dict = Field(default_factory=dict)


class ItineraryFeedbackOut(BaseModel):
    id: uuid.UUID
    planId: uuid.UUID
    tripId: uuid.UUID
    userId: uuid.UUID
    itemKey: str
    action: str
    reason: str | None = None
    replacementPlaceId: str | None = None
    details: dict
    actor: str
    createdAt: datetime


class EditorialRuleCreate(BaseModel):
    scope: str = Field(default="India", min_length=2, max_length=100)
    condition: str = Field(min_length=3, max_length=500)
    action: str = Field(min_length=3, max_length=5000)
    priority: int = Field(default=50, ge=0, le=100)
    sourceFeedbackId: uuid.UUID | None = None


class EditorialRuleDecision(BaseModel):
    status: str = Field(pattern="^(published|needs_review|retired)$")


class PlanStaffDecision(BaseModel):
    status: str = Field(pattern="^(approved|rejected|needs_staff_review)$")
    note: str | None = Field(default=None, max_length=1000)


class EditorialRuleOut(BaseModel):
    id: uuid.UUID
    scope: str
    condition: str
    action: str
    priority: int
    status: str
    sourceFeedbackId: uuid.UUID | None = None
    createdAt: datetime
    updatedAt: datetime


class ActivityOut(BaseModel):
    startTime: str
    placeId: str | None = None
    placeName: str
    durationMinutes: int
    reason: str
    bookingRequired: bool = False
    status: str = "planned"


class ItineraryDayOut(BaseModel):
    day: int
    date: date
    city: str
    activities: list[ActivityOut]


class ItineraryPlanOut(BaseModel):
    id: uuid.UUID
    tripId: uuid.UUID
    version: int
    status: str
    model: str
    promptVersion: str
    days: list[ItineraryDayOut]
    preferencesSnapshot: dict
    sourceClaimIds: list[str]
    validation: dict
    approvedAt: datetime | None = None
    createdAt: datetime


class GenerateItineraryResponse(BaseModel):
    tripId: uuid.UUID
    days: list[ItineraryDayOut]
    groundedInKnowledgeBase: bool


class TripTimelineResponse(BaseModel):
    trip: TripOut
    days: list[ItineraryDayOut]
    bookings: list["TripBookingOut"] = Field(default_factory=list)


class TripBookingCreate(BaseModel):
    kind: str = Field(pattern="^(transport|stay|activity|service)$")
    title: str = Field(min_length=1, max_length=200)
    provider: str = Field(min_length=1, max_length=100)
    startsAt: datetime | None = None
    endsAt: datetime | None = None
    reference: str | None = Field(default=None, max_length=100)
    status: str = Field(default="confirmed", pattern="^(pending|confirmed|cancelled)$")
    deepLink: str | None = Field(default=None, max_length=1000)


class TripBookingOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    provider: str
    startsAt: datetime | None = None
    endsAt: datetime | None = None
    reference: str | None = None
    status: str
    deepLink: str | None = None


class TripMemoryNoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=500)


class TripMemoryNoteOut(BaseModel):
    id: uuid.UUID
    tripId: uuid.UUID
    note: str
    source: str
    createdAt: datetime


class UserPreferenceCreate(BaseModel):
    statement: str = Field(min_length=1, max_length=500)


class UserPreferenceOut(BaseModel):
    id: uuid.UUID
    statement: str
    createdAt: datetime


class StaySearchRequest(BaseModel):
    city: str = Field(min_length=2, max_length=100)
    checkIn: date
    checkOut: date
    budgetLevel: str = Field(default="backpacker", pattern="^(backpacker|comfort|luxury|mixed)$")
    guests: int = Field(default=1, ge=1, le=20)
    travelerStyle: str = Field(default="balanced", pattern="^(balanced|social|quiet|remote_work|trek|solo)$")


class GrocerySessionCreate(BaseModel):
    items: list[dict] = Field(min_length=1, max_length=100)


class GrocerySessionOut(BaseModel):
    id: uuid.UUID
    provider: str
    items: list[dict]
    createdAt: datetime


class CommunityEventOut(BaseModel):
    id: str
    city: str
    title: str
    venue: str
    category: str
    startTime: str
    endTime: str
    source: str
    verificationStatus: str


class CommunityEventsResponse(BaseModel):
    events: list[CommunityEventOut]
    city: str | None = None


class BuddyMatchRequest(BaseModel):
    text: str = Field(min_length=3, max_length=1000)


class BuddyMatchOut(BaseModel):
    groupId: str
    name: str
    destination: str
    dateRange: str
    members: int
    budgetBand: str
    style: str
    interests: str
    compatibility: int


class BuddyMatchesResponse(BaseModel):
    matches: list[BuddyMatchOut]
    parsedRequest: dict


class BuddyWaitlistCreate(BaseModel):
    groupId: str = Field(min_length=1, max_length=80)
    groupName: str = Field(min_length=1, max_length=200)
    requestText: str | None = Field(default=None, max_length=1000)


class BuddyWaitlistOut(BaseModel):
    id: uuid.UUID
    groupId: str
    groupName: str
    requestText: str | None = None
    status: str
    createdAt: datetime


class BuddyWaitlistListResponse(BaseModel):
    requests: list[BuddyWaitlistOut]


class BuddyPeerOut(BaseModel):
    peerId: uuid.UUID
    groupId: str
    groupName: str
    label: str
    displayName: str | None = None
    youConsented: bool
    theyConsented: bool
    chatUnlocked: bool
    pairId: uuid.UUID | None = None


class BuddyPeerListResponse(BaseModel):
    peers: list[BuddyPeerOut]


class BuddyConsentCreate(BaseModel):
    peerId: uuid.UUID


class BuddyThreadOut(BaseModel):
    pairId: uuid.UUID
    groupId: str
    groupName: str
    displayName: str
    chatUnlocked: bool = True


class BuddyThreadListResponse(BaseModel):
    threads: list[BuddyThreadOut]


class BuddyMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class BuddyMessageOut(BaseModel):
    id: uuid.UUID
    sender: str
    body: str
    createdAt: datetime


class BuddyMessageListResponse(BaseModel):
    pairId: uuid.UUID
    displayName: str
    groupName: str
    messages: list[BuddyMessageOut]


class GuardianIncidentCreate(BaseModel):
    category: str = Field(pattern="^(police|medical|lost|scam|harassment|trail|other)$")
    note: str | None = Field(default=None, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class GuardianIncidentAction(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class GuardianIncidentOut(BaseModel):
    id: uuid.UUID
    category: str
    status: str
    note: str | None
    latitude: float | None
    longitude: float | None
    checkinAt: datetime | None
    sharedAt: datetime | None
    resolvedAt: datetime | None
    createdAt: datetime
    updatedAt: datetime


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    targetLanguage: str = Field(default="hindi", min_length=2, max_length=30)
    sourceLanguage: str = Field(default="en", min_length=2, max_length=30)


class TranslationResponse(BaseModel):
    sourceText: str
    targetLanguage: str
    translatedText: str
    pronunciation: str | None
    confidence: str
    mode: str
    context: list[dict] = Field(default_factory=list)


class RiskPatternOut(BaseModel):
    id: uuid.UUID
    city: str
    locationLabel: str
    category: str
    pattern: str
    recommendation: str
    confidence: str
    sourceName: str
    sourceUrl: str | None
    lastVerified: date


class RiskPatternsResponse(BaseModel):
    results: list[RiskPatternOut]
    city: str | None = None
    category: str | None = None


class ExplorerApplyRequest(BaseModel):
    city: str = Field(min_length=2, max_length=50)
    motivation: str = Field(min_length=20, max_length=1000)


class ExplorerActivateRequest(BaseModel):
    safetyAcknowledged: bool


class ExplorerProfileOut(BaseModel):
    id: uuid.UUID
    status: str
    reputationPoints: int
    missionsCompleted: int


class ExplorerMissionOut(BaseModel):
    id: uuid.UUID
    title: str
    category: str
    city: str
    description: str
    safetyNote: str
    requiredEvidence: list


class ExplorerSubmissionCreate(BaseModel):
    text: str = Field(min_length=20, max_length=2000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    evidenceUrl: str | None = Field(default=None, max_length=1000)


class ExplorerSubmissionOut(BaseModel):
    id: uuid.UUID
    missionId: uuid.UUID
    text: str
    latitude: float | None
    longitude: float | None
    evidenceUrl: str | None
    status: str
    reviewerNote: str | None
    createdAt: datetime


class ExpertProfileCreate(BaseModel):
    displayName: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=50)
    specialties: list[str] = Field(min_length=1, max_length=10)


class ExpertProfileOut(BaseModel):
    id: uuid.UUID
    displayName: str
    city: str
    specialties: list[str]
    status: str
    rating: float


class ExpertCaseCreate(BaseModel):
    city: str | None = Field(default=None, max_length=50)
    category: str = Field(pattern="^(local_advice|community_report|content_dispute|non_emergency_safety|other)$")
    question: str = Field(min_length=10, max_length=2000)


class ExpertCaseResponseCreate(BaseModel):
    response: str = Field(min_length=10, max_length=3000)


class ExpertCaseOut(BaseModel):
    id: uuid.UUID
    requesterId: uuid.UUID
    expertId: uuid.UUID | None
    city: str | None
    category: str
    question: str
    status: str
    response: str | None
    createdAt: datetime
    updatedAt: datetime


class ModerationDecision(BaseModel):
    status: str = Field(pattern="^(approved|rejected|published|needs_review|active|suspended)$")
    reviewerNote: str | None = Field(default=None, max_length=1000)


class KnowledgeSourceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    sourceUrl: str | None = Field(default=None, max_length=500)
    sourceType: str = Field(default="official", min_length=2, max_length=30)
    authorityLevel: str = Field(default="primary", min_length=2, max_length=20)
    licenseNote: str | None = Field(default=None, max_length=500)


class KnowledgeEntityCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    city: str = Field(min_length=2, max_length=100)
    fact: str = Field(min_length=10, max_length=2000)
    entityType: str = Field(default="place", min_length=2, max_length=50)


class KnowledgeClaimCreate(BaseModel):
    entityId: uuid.UUID
    sourceId: uuid.UUID
    claim: str = Field(min_length=10, max_length=2000)
    language: str = Field(default="en", min_length=2, max_length=10)
    sourceLocator: str | None = Field(default=None, max_length=500)
    confidence: str = Field(default="estimated", pattern="^(verified|estimated|unverified)$")
    lastVerified: date


class KnowledgeModerationDecision(BaseModel):
    status: str = Field(pattern="^(published|needs_review|rejected|active|retired)$")
    reviewerNote: str | None = Field(default=None, max_length=1000)


class KnowledgeObservationCreate(BaseModel):
    entityId: uuid.UUID
    sourceId: uuid.UUID
    kind: str = Field(pattern="^(hours|ticketing|rating|activity)$")
    conflictKey: str = Field(min_length=2, max_length=100)
    value: dict
    sourceUrl: str | None = Field(default=None, max_length=1000)
    observedAt: date
    refreshAfter: date


class KnowledgeObservationDecision(BaseModel):
    status: str = Field(pattern="^(approved|needs_review|rejected|retired)$")
    reviewerNote: str | None = Field(default=None, max_length=1000)


class KnowledgeInteractionFeedback(BaseModel):
    helpful: bool
    note: str | None = Field(default=None, max_length=1000)


class KnowledgeInteractionOut(BaseModel):
    id: uuid.UUID
    feedback: str | None
    outcome: str


class KnowledgeGapOut(BaseModel):
    id: uuid.UUID
    query: str
    intent: str
    occurrenceCount: int
    noMatchCount: int
    negativeFeedbackCount: int
    priority: int
    status: str
    lastSeenAt: datetime
    resolutionNote: str | None = None


class KnowledgeGapDecision(BaseModel):
    status: str = Field(pattern="^(open|in_progress|resolved|dismissed)$")
    resolutionNote: str | None = Field(default=None, max_length=2000)


class KnowledgeImprovementReport(BaseModel):
    totalInteractions: int
    noMatch: int
    lowConfidence: int
    negativeFeedback: int
    openGaps: int
    resolvedGaps: int
    topGaps: list[dict]


class KnowledgeObservationOut(BaseModel):
    id: uuid.UUID
    entityId: uuid.UUID
    entityName: str
    city: str
    sourceId: uuid.UUID
    sourceName: str
    sourceUrl: str | None
    kind: str
    conflictKey: str
    value: dict
    observedAt: date
    refreshAfter: date
    status: str
    reviewerId: uuid.UUID | None = None
    reviewerNote: str | None = None


class KnowledgeOperationalHealthOut(BaseModel):
    total: int
    stale: int
    needsReview: int
    conflicts: list[str]
    alert: str
    checkedOn: date


class DestinationProfileOut(BaseModel):
    entityId: uuid.UUID
    name: str
    city: str
    state: str
    region: str
    destinationKind: str
    tags: list[str]
    bestSeasons: list[str]
    typicalStayMinDays: int
    typicalStayMaxDays: int
    altitudeM: int | None = None
    gatewayCity: str | None = None
    gatewayAirports: list[str]
    accessNotes: str | None = None
    safetyNotes: str | None = None
    accessibility: dict
    sourceUrl: str | None = None
    lastVerified: date
    refreshAfter: date
    status: str


class DestinationRouteOut(BaseModel):
    origin: str
    destination: str
    originCity: str
    destinationCity: str
    mode: str
    distanceKm: float | None = None
    typicalMinMinutes: int
    typicalMaxMinutes: int
    seasonNotes: str | None = None
    sourceUrl: str | None = None
    observedAt: date
    refreshAfter: date
    status: str


class KnowledgeEditorialClaimOut(BaseModel):
    id: uuid.UUID
    entityId: uuid.UUID
    entityName: str
    city: str
    sourceId: uuid.UUID
    sourceName: str
    sourceUrl: str | None
    claim: str
    language: str
    confidence: str
    verificationStatus: str
    lastVerified: date
    updatedAt: datetime


class KnowledgeEditorialQueueResponse(BaseModel):
    results: list[KnowledgeEditorialClaimOut]
    status: str | None = None


class KnowledgeModerationAuditOut(BaseModel):
    id: uuid.UUID
    reviewerId: uuid.UUID
    targetType: str
    targetId: uuid.UUID
    previousStatus: str | None
    newStatus: str
    note: str | None
    createdAt: datetime


class TrailSummaryOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    region: str
    summary: str
    distanceKm: float
    elevationGainM: int
    minAltitudeM: int
    maxAltitudeM: int
    difficulty: str
    seasonality: str
    permitNotes: str | None
    verificationStatus: str
    lastVerified: date
    packageVersion: str
    navigationReady: bool
    sourceName: str
    sourceUrl: str | None


class TrailWaypointOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    latitude: float
    longitude: float
    elevationM: int | None
    description: str
    sourceConfidence: str


class TrailHazardOut(BaseModel):
    id: uuid.UUID
    category: str
    description: str
    latitude: float | None
    longitude: float | None
    sourceKind: str
    confidence: str
    status: str
    observedAt: datetime
    expiresAt: datetime | None


class TrailDetailOut(TrailSummaryOut):
    routeGeojson: dict
    waypoints: list[TrailWaypointOut] = Field(default_factory=list)
    hazards: list[TrailHazardOut] = Field(default_factory=list)


class TrailPackageOut(BaseModel):
    trail: TrailDetailOut
    emergencyNumbers: list[dict]
    packageWarning: str
    generatedAt: datetime


class PeakOut(BaseModel):
    id: uuid.UUID
    name: str
    elevationM: int
    latitude: float
    longitude: float
    distanceKm: float
    bearingDegrees: float
    direction: str
    confidence: str
    description: str
    sourceName: str
    lastVerified: date
    angularDifferenceDegrees: float | None = None
    lineOfSight: str = "unverified"


class PeaksResponse(BaseModel):
    results: list[PeakOut]
    latitude: float
    longitude: float
    bearingDegrees: float | None = None
    fieldOfView: float | None = None
    demApplied: bool = False
    identificationMethod: str = "catalog_distance"
    demNote: str | None = None


class TrailHazardCreate(BaseModel):
    category: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=10, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    sourceKind: str = Field(pattern="^(official_notice|community_report|explorer_submission|editorial)$")
    confidence: str = Field(pattern="^(verified|estimated|unverified)$")
    expiresAt: datetime | None = None


class TrailModerationDecision(BaseModel):
    status: str = Field(pattern="^(verified|preview|rejected|published|active|retired|needs_review)$")
    reviewerNote: str | None = Field(default=None, max_length=1000)


class StayScoreComponentOut(BaseModel):
    key: str
    label: str
    score: int = Field(ge=0, le=100)
    weight: int = Field(ge=0, le=100)


class ProviderHandoffOut(BaseModel):
    key: str
    displayName: str
    category: str
    url: str
    live: bool = True
    note: str


class StayResultOut(BaseModel):
    recommendationId: uuid.UUID
    observationId: uuid.UUID
    provider: str
    stayType: str
    city: str
    checkIn: date
    checkOut: date
    pricePerNight: int
    totalPrice: int
    rating: float
    distanceToCenterKm: float
    cancellationScore: float
    availability: bool
    retrievedAt: datetime
    freshness: str
    bookable: bool
    liveCheckRequired: bool
    score: float
    badges: list[str]
    explanation: str
    scoreBreakdown: list[StayScoreComponentOut]
    contextSignals: list[str]


class StaySearchResponse(BaseModel):
    results: list[StayResultOut]
    isDemoData: bool
    liveCheckRequired: bool
    message: str
    handoffs: list[ProviderHandoffOut] = Field(default_factory=list)


class OnboardingCallCreate(BaseModel):
    phoneNumber: str = Field(pattern=r"^\+[1-9]\d{7,14}$", description="E.164 phone number")
    callConsent: bool
    recordingConsent: bool = False


class OnboardingCallOut(BaseModel):
    id: uuid.UUID
    phoneNumber: str
    status: str
    providerCallId: str | None = None
    recordingConsent: bool


class CompareSearchRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=100)
    destination: str = Field(min_length=2, max_length=100)
    departureDate: date
    budgetLevel: str = Field(default="backpacker", pattern="^(backpacker|comfort|luxury|mixed)$")
    tripId: uuid.UUID | None = None


class CompareResultOut(BaseModel):
    recommendationId: uuid.UUID
    observationId: uuid.UUID
    provider: str
    mode: str
    origin: str
    destination: str
    departureAt: datetime
    arrivalAt: datetime
    basePrice: int
    fees: int
    totalPrice: int
    durationMinutes: int
    cancellationScore: float
    reliabilityScore: float
    availability: bool
    retrievedAt: datetime
    freshness: str
    bookable: bool
    liveCheckRequired: bool
    score: float
    badges: list[str]
    explanation: str


class OnboardingConfigOut(BaseModel):
    ready: bool
    missing: list[str]
    recordingEnabled: bool = False
    publicBaseUrlSet: bool


class CompareSearchResponse(BaseModel):
    results: list[CompareResultOut]
    isDemoData: bool
    liveCheckRequired: bool
    message: str
    handoffs: list[ProviderHandoffOut] = Field(default_factory=list)


class OutcomeCreate(BaseModel):
    outcomeType: str = Field(pattern="^(opened|selected|booked|dismissed)$")
    details: dict = Field(default_factory=dict)


class OutcomeOut(BaseModel):
    id: uuid.UUID
    recommendationId: uuid.UUID
    outcomeType: str
    createdAt: datetime


class KnowledgeCitationOut(BaseModel):
    sourceName: str
    sourceUrl: str | None = None
    sourceLocator: str | None = None
    lastVerified: date | None = None
    confidence: str


class KnowledgeClaimOut(BaseModel):
    claimId: uuid.UUID
    entityId: uuid.UUID
    entityName: str
    entityType: str
    city: str
    claim: str
    language: str
    citation: KnowledgeCitationOut


class GuideIdentifyResponse(BaseModel):
    matched: bool
    entityName: str | None
    confidence: str  # "high" | "medium" | "low" | "none"
    reply: str
    citations: list[KnowledgeCitationOut] = Field(default_factory=list)
    contentMode: str = "overview"


class KnowledgeSearchResponse(BaseModel):
    results: list[KnowledgeClaimOut]
    query: str
    city: str | None = None
    provenance: str = "verified"


class DestinationRecommendationOut(BaseModel):
    placeId: uuid.UUID
    name: str
    city: str
    fact: str
    score: float
    scoreBreakdown: dict
    experienceTags: list[str]
    source: KnowledgeCitationOut
    tradeoffs: list[str] = Field(default_factory=list)


class DestinationRecommendationsResponse(BaseModel):
    results: list[DestinationRecommendationOut]
    profile: dict
    month: int | None = None
    provenance: str = "reviewed"


class ZennyVoiceTurnResponse(BaseModel):
    sessionId: str
    interactionId: uuid.UUID | None = None
    transcript: str
    spokenText: str
    intent: str
    policyTier: str
    confidence: str
    citations: list[KnowledgeCitationOut] = Field(default_factory=list)
    items: list[str] = Field(default_factory=list)
    brain: str = "zentrip"


class ZennyVoiceStatusResponse(BaseModel):
    agentReady: bool
    liveSttReady: bool
    voiceLiveEnabled: bool
    livekitReady: bool = False


class ZennyLivekitTokenRequest(BaseModel):
    sessionId: str | None = None


class ZennyLivekitTokenResponse(BaseModel):
    url: str
    token: str
    room: str
    sessionId: str


class ZennyAgentSessionRequest(BaseModel):
    sessionId: str | None = None
    tripId: uuid.UUID | None = None


class ZennyAgentSessionResponse(BaseModel):
    sessionId: str
    wsUrl: str
    ticket: str
    provider: str = "sarvam-voice-agent"
    duplex: bool = True
    sampleRate: int = 16000


class ZennyLiveSessionRequest(BaseModel):
    sessionId: str | None = None
    tripId: uuid.UUID | None = None


class ZennyLiveSessionResponse(BaseModel):
    sessionId: str
    wsUrl: str
    ticket: str
    sttProvider: str
