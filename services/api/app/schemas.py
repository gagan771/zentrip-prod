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


class GenerateItineraryResponse(BaseModel):
    tripId: uuid.UUID
    days: list[ItineraryDayOut]
    groundedInKnowledgeBase: bool


class TripTimelineResponse(BaseModel):
    trip: TripOut
    days: list[ItineraryDayOut]


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


class StaySearchResponse(BaseModel):
    results: list[StayResultOut]
    isDemoData: bool
    liveCheckRequired: bool
    message: str


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


class CompareSearchResponse(BaseModel):
    results: list[CompareResultOut]
    isDemoData: bool
    liveCheckRequired: bool
    message: str


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
    lastVerified: date
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


class KnowledgeSearchResponse(BaseModel):
    results: list[KnowledgeClaimOut]
    query: str
    city: str | None = None
    provenance: str = "verified"


class ZennyVoiceTurnResponse(BaseModel):
    transcript: str
    spokenText: str
    intent: str
    policyTier: str
    confidence: str
    citations: list[KnowledgeCitationOut] = Field(default_factory=list)
    items: list[str] = Field(default_factory=list)
