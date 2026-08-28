import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import OnboardingCall, User
from app.schemas import OnboardingCallCreate, OnboardingCallOut, OnboardingConfigOut
from app.twilio_voice import (
    ONBOARDING_QUESTIONS,
    TwilioNotConfiguredError,
    TwilioProviderError,
    build_completion_twiml,
    build_question_twiml,
    is_valid_webhook_signature,
    initiate_outbound_call,
)

router = APIRouter(prefix="/v1/onboarding/calls", tags=["onboarding"])
config_router = APIRouter(prefix="/v1/onboarding", tags=["onboarding"])


@config_router.get("/config", response_model=OnboardingConfigOut)
async def onboarding_config(_user: User = Depends(get_current_user)) -> OnboardingConfigOut:
    missing = [
        name
        for name, value in (
            ("TWILIO_ACCOUNT_SID", settings.twilio_account_sid),
            ("TWILIO_AUTH_TOKEN", settings.twilio_auth_token),
            ("TWILIO_FROM_NUMBER", settings.twilio_from_number),
            ("PUBLIC_BASE_URL", settings.public_base_url),
        )
        if not value
    ]
    return OnboardingConfigOut(
        ready=not missing,
        missing=missing,
        recordingEnabled=False,
        publicBaseUrlSet=bool(settings.public_base_url),
    )


def _out(call: OnboardingCall) -> OnboardingCallOut:
    return OnboardingCallOut(
        id=call.id,
        phoneNumber=call.phone_number,
        status=call.status,
        providerCallId=call.provider_call_id,
        recordingConsent=call.recording_consent,
    )


async def _load_call(db: AsyncSession, call_id: uuid.UUID) -> OnboardingCall:
    call = (await db.execute(select(OnboardingCall).where(OnboardingCall.id == call_id))).scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding call not found")
    return call


async def _verify_twilio_request(request: Request, form: dict[str, str]) -> None:
    # Keep local function tests convenient when no Twilio token is configured. Once the
    # real token is present, every public callback is signature-checked.
    if not settings.twilio_auth_token:
        return
    signature = request.headers.get("X-Twilio-Signature")
    url = f"{settings.public_base_url.rstrip('/')}{request.url.path}"
    if not is_valid_webhook_signature(url, form, signature):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio webhook signature")


@router.post("", response_model=OnboardingCallOut, status_code=status.HTTP_201_CREATED)
async def request_onboarding_call(
    body: OnboardingCallCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OnboardingCallOut:
    if not body.callConsent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit callConsent is required before placing an onboarding call",
        )

    call = OnboardingCall(
        user_id=user.id,
        phone_number=body.phoneNumber,
        call_consent=True,
        recording_consent=body.recordingConsent,
        answers={},
    )
    db.add(call)
    await db.flush()
    try:
        provider_call = await asyncio.to_thread(initiate_outbound_call, str(call.id), body.phoneNumber)
    except TwilioNotConfiguredError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except TwilioProviderError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    call.provider_call_id = provider_call["sid"]
    call.status = provider_call["status"]
    await db.commit()
    return _out(call)


@router.post("/{call_id}/twiml", response_class=Response)
async def onboarding_twiml(call_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    # Twilio sends an empty POST for the initial TwiML fetch.
    await _verify_twilio_request(request, {})
    call = await _load_call(db, call_id)
    if call.question_index >= len(ONBOARDING_QUESTIONS):
        content = build_completion_twiml()
    else:
        content = build_question_twiml(str(call.id), call.question_index)
    return Response(content=content, media_type="application/xml")


@router.post("/{call_id}/respond", response_class=Response)
async def respond_to_onboarding_prompt(call_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    call = await _load_call(db, call_id)
    form = await request.form()
    form_values = {str(key): str(value) for key, value in form.items()}
    await _verify_twilio_request(request, form_values)
    answer = str(form_values.get("SpeechResult") or form_values.get("Digits") or "").strip()
    if answer:
        call.answers = {**(call.answers or {}), str(call.question_index): answer}
        call.question_index += 1
        await db.commit()

    if call.question_index >= len(ONBOARDING_QUESTIONS):
        call.answers = {**(call.answers or {}), "completed": True}
        await db.commit()
        return Response(content=build_completion_twiml(), media_type="application/xml")

    return Response(content=build_question_twiml(str(call.id), call.question_index), media_type="application/xml")


@router.post("/{call_id}/status", status_code=status.HTTP_204_NO_CONTENT)
async def onboarding_status(call_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)) -> None:
    call = await _load_call(db, call_id)
    form = await request.form()
    form_values = {str(key): str(value) for key, value in form.items()}
    await _verify_twilio_request(request, form_values)
    provider_status = str(form_values.get("CallStatus") or "").strip().lower()
    provider_call_id = str(form_values.get("CallSid") or "").strip()
    if call.provider_call_id and provider_call_id and provider_call_id != call.provider_call_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Call SID does not match")
    if provider_status:
        call.status = provider_status
    await db.commit()
