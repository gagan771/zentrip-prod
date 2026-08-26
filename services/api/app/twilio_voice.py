"""Small Twilio Programmable Voice adapter for outbound onboarding.

This first increment uses TwiML speech Gather so it is testable without a media
streaming vendor. The adapter boundary is intentionally separate: replacing Gather
with ConversationRelay/Media Streams later does not change the call API or persisted
call state.
"""

import base64
import hashlib
import hmac
from html import escape

import requests

from app.config import settings


class TwilioNotConfiguredError(Exception):
    pass


class TwilioProviderError(Exception):
    pass


def is_valid_webhook_signature(url: str, params: dict[str, str], signature: str | None) -> bool:
    """Validate Twilio's X-Twilio-Signature without adding another SDK dependency."""
    if not signature:
        return False
    payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    digest = base64.b64encode(
        hmac.new(settings.twilio_auth_token.encode(), payload.encode(), hashlib.sha1).digest()
    ).decode()
    return hmac.compare_digest(digest, signature)


ONBOARDING_QUESTIONS = (
    "Where are you traveling from?",
    "How many days will you be in India, and roughly when are you traveling?",
    "Which cities or places would you like to visit?",
    "What is your budget style: backpacker, comfort, luxury, or a mix?",
    "What are you most interested in: culture, food, nature, adventure, or a mix?",
    "What pace do you prefer, relaxed or packed? Is there anything you definitely want to avoid?",
)


def require_configured() -> None:
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
    if missing:
        raise TwilioNotConfiguredError(f"Twilio onboarding isn't configured yet — set {', '.join(missing)}")


def _url(path: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}{path}"


def initiate_outbound_call(call_id: str, phone_number: str) -> dict[str, str]:
    require_configured()
    endpoint = (
        f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json"
    )
    try:
        response = requests.post(
            endpoint,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={
                "To": phone_number,
                "From": settings.twilio_from_number,
                "Url": _url(f"/v1/onboarding/calls/{call_id}/twiml"),
                "Method": "POST",
                "StatusCallback": _url(f"/v1/onboarding/calls/{call_id}/status"),
                "StatusCallbackMethod": "POST",
                "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        raise TwilioProviderError(f"Could not reach Twilio: {exc}") from exc
    if not response.ok:
        raise TwilioProviderError(f"Twilio returned HTTP {response.status_code}: {response.text[:500]}")
    payload = response.json()
    return {"sid": payload["sid"], "status": payload.get("status", "queued")}


def _say(text: str) -> str:
    return f'<Say voice="alice" language="en-US">{escape(text)}</Say>'


def build_question_twiml(call_id: str, question_index: int) -> str:
    question = ONBOARDING_QUESTIONS[min(question_index, len(ONBOARDING_QUESTIONS) - 1)]
    action = _url(f"/v1/onboarding/calls/{call_id}/respond")
    redirect = _url(f"/v1/onboarding/calls/{call_id}/twiml")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        + _say(
            "Hi, this is Zentrip's AI travel assistant calling to help plan your India trip. "
            "This call is not recorded. You can hang up at any time."
            if question_index == 0
            else "Thanks."
        )
        + f'<Gather input="speech" action="{escape(action)}" method="POST" language="en-US" speechTimeout="auto">'
        + _say(question)
        + "</Gather>"
        + f'<Redirect method="POST">{escape(redirect)}</Redirect>'
        + "</Response>"
    )


def build_completion_twiml() -> str:
    return '<?xml version="1.0" encoding="UTF-8"?><Response>' + _say(
        "Thanks for sharing that. We have saved your onboarding answers. You can now open Zentrip to continue planning your trip. Goodbye."
    ) + "<Hangup/></Response>"
