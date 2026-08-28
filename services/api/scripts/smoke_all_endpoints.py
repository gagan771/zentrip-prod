"""Full HTTP smoke suite for Zentrip API. Writes results JSON for the results canvas."""

from __future__ import annotations

import json
import sys
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"
OUT = Path(__file__).resolve().parent / "smoke_results.json"
results: list[dict] = []


def record(name: str, method: str, path: str, ok: bool, status: int, detail: str, ms: float) -> None:
    results.append(
        {
            "name": name,
            "method": method,
            "path": path,
            "ok": ok,
            "status": status,
            "detail": detail[:300],
            "ms": round(ms, 1),
        }
    )
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name} {status} {ms:.0f}ms — {detail[:120]}")


def call(name: str, method: str, path: str, *, expect: int | set[int] = 200, headers=None, json_body=None, params=None, data=None, files=None) -> requests.Response | None:
    url = f"{BASE}{path}"
    expected = expect if isinstance(expect, set) else {expect}
    t0 = time.perf_counter()
    try:
        resp = requests.request(method, url, headers=headers, json=json_body, params=params, data=data, files=files, timeout=30)
        ms = (time.perf_counter() - t0) * 1000
        ok = resp.status_code in expected
        detail = resp.text[:200].replace("\n", " ")
        # Avoid Windows console UnicodeEncodeError on Tamil/Hindi phrasebook output.
        record(name, method, path, ok, resp.status_code, detail.encode("ascii", "replace").decode("ascii"), ms)
        return resp
    except Exception as exc:  # noqa: BLE001
        ms = (time.perf_counter() - t0) * 1000
        record(name, method, path, False, 0, str(exc).encode("ascii", "replace").decode("ascii"), ms)
        return None


def main() -> int:
    call("health", "GET", "/health", expect=200)
    call("ready", "GET", "/ready", expect=200)

    email = f"smoke_{uuid.uuid4().hex[:10]}@example.com"
    staff_email = "staff@example.com"
    password = "SmokeTest1!"

    reg = call(
        "auth.register",
        "POST",
        "/v1/auth/register",
        expect=201,
        json_body={"email": email, "password": password, "name": "Smoke Tester"},
    )
    tokens = reg.json() if reg and reg.status_code == 201 else {}
    access = tokens.get("accessToken", "")
    refresh = tokens.get("refreshToken", "")
    if not access:
        OUT.write_text(json.dumps({"error": "register failed", "results": results}, indent=2), encoding="utf-8")
        print("ABORT: register failed")
        return 1
    auth = {"Authorization": f"Bearer {access}"}

    call("auth.login", "POST", "/v1/auth/login", expect=200, json_body={"email": email, "password": password})
    call("auth.me", "GET", "/v1/auth/me", expect=200, headers=auth)
    call("auth.google_unconfigured_or_invalid", "POST", "/v1/auth/google", expect={401, 503}, json_body={"idToken": "not-a-real-token"})

    refreshed = call("auth.refresh", "POST", "/v1/auth/refresh", expect=200, json_body={"refreshToken": refresh})
    if refreshed and refreshed.status_code == 200:
        access = refreshed.json()["accessToken"]
        refresh = refreshed.json()["refreshToken"]
        auth = {"Authorization": f"Bearer {access}"}
    call("auth.logout", "POST", "/v1/auth/logout", expect=204, json_body={"refreshToken": refresh})
    # Re-login for remaining tests
    login = call("auth.relogin", "POST", "/v1/auth/login", expect=200, json_body={"email": email, "password": password})
    if login and login.status_code == 200:
        access = login.json()["accessToken"]
        auth = {"Authorization": f"Bearer {access}"}

    # Staff user for moderation
    call(
        "auth.register_staff",
        "POST",
        "/v1/auth/register",
        expect={201, 409},
        json_body={"email": staff_email, "password": password, "name": "Staff"},
    )
    staff_login = call("auth.staff_login", "POST", "/v1/auth/login", expect=200, json_body={"email": staff_email, "password": password})
    staff_auth = {"Authorization": f"Bearer {staff_login.json()['accessToken']}"} if staff_login and staff_login.status_code == 200 else auth

    start = date.today() + timedelta(days=14)
    end = start + timedelta(days=4)
    trip = call(
        "trips.create",
        "POST",
        "/v1/trips",
        expect=201,
        headers=auth,
        json_body={
            "originCountry": "US",
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "cities": ["Delhi", "Agra", "Jaipur"],
            "budgetLevel": "backpacker",
        },
    )
    trip_id = trip.json()["id"] if trip and trip.status_code == 201 else None
    if trip_id:
        call("trips.get", "GET", f"/v1/trips/{trip_id}", expect=200, headers=auth)
        call("trips.itinerary", "GET", f"/v1/trips/{trip_id}/itinerary", expect=200, headers=auth)
        call("trips.timeline", "GET", f"/v1/trips/{trip_id}/timeline", expect=200, headers=auth)
        call(
            "trips.generate_itinerary",
            "POST",
            f"/v1/trips/{trip_id}/generate-itinerary",
            expect={200, 503},
            headers=auth,
        )
        call(
            "trips.bookings",
            "POST",
            f"/v1/trips/{trip_id}/bookings",
            expect=201,
            headers=auth,
            json_body={
                "kind": "transport",
                "title": "Delhi to Agra demo",
                "provider": "IRCTC demo",
                "startsAt": f"{start.isoformat()}T08:00:00",
                "endsAt": f"{start.isoformat()}T10:30:00",
                "reference": "SMOKE1",
                "status": "confirmed",
            },
        )
        call(
            "memory.trip_note",
            "POST",
            f"/v1/trips/{trip_id}/memory",
            expect=201,
            headers=auth,
            json_body={"note": "Smoke test note for trip memory"},
        )
        call("memory.trip_list", "GET", f"/v1/trips/{trip_id}/memory", expect=200, headers=auth)

    call(
        "memory.pref_create",
        "POST",
        "/v1/preferences",
        expect=201,
        headers=auth,
        json_body={"statement": "I prefer a relaxed pace"},
    )
    prefs = call("memory.pref_list", "GET", "/v1/preferences", expect=200, headers=auth)
    if prefs and prefs.status_code == 200 and prefs.json():
        pref_id = prefs.json()[0]["id"]
        call("memory.pref_delete", "DELETE", f"/v1/preferences/{pref_id}", expect=204, headers=auth)

    call(
        "agent.message_guide",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "Tell me about the Taj Mahal"},
    )
    call(
        "agent.message_compare",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "cheapest train from Delhi to Agra"},
    )
    call(
        "agent.message_safety",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "I feel unsafe, help me"},
    )
    call(
        "agent.message_payment",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "how do I pay with UPI here"},
    )
    call(
        "agent.message_services",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "I need toothpaste and a USB-C charger"},
    )
    call(
        "agent.message_translation",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "how do I say thank you in Tamil"},
    )
    call(
        "agent.message_community",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "what's happening tonight in Jaipur?"},
    )
    call(
        "agent.message_buddy",
        "POST",
        "/v1/agent/message",
        expect=200,
        headers=auth,
        json_body={"text": "find travel buddies for Spiti in October, trekking"},
    )
    call("agent.session", "GET", "/v1/agent/session", expect=200, headers=auth)

    call(
        "compare.transport",
        "POST",
        "/v1/compare/search",
        expect=200,
        headers=auth,
        json_body={
            "origin": "Delhi",
            "destination": "Agra",
            "departureDate": start.isoformat(),
            "budgetLevel": "backpacker",
        },
    )
    stays = call(
        "compare.stays",
        "POST",
        "/v1/compare/stays/search",
        expect=200,
        headers=auth,
        json_body={
            "city": "Jaipur",
            "checkIn": start.isoformat(),
            "checkOut": (start + timedelta(days=2)).isoformat(),
            "budgetLevel": "backpacker",
            "travelerStyle": "social",
        },
    )
    if stays and stays.status_code == 200:
        recs = stays.json().get("recommendations") or stays.json().get("results") or []
        # Outcome endpoint is transport recommendations; skip if shape differs
        pass

    call("knowledge.search", "GET", "/v1/knowledge/search", expect=200, params={"q": "Taj Mahal", "city": "Agra"})
    call("knowledge.payment_cash", "GET", "/v1/knowledge/search", expect=200, params={"q": "ATM cash"})
    call("knowledge.like_escape", "GET", "/v1/knowledge/search", expect=200, params={"q": "100%_scams"})

    call(
        "translation.translate",
        "POST",
        "/v1/translation/translate",
        expect=200,
        headers=auth,
        json_body={"text": "Thank you", "targetLanguage": "tamil"},
    )

    call("community.events", "GET", "/v1/community/events", expect=200, headers=auth, params={"city": "Jaipur"})
    call(
        "buddy.matches",
        "POST",
        "/v1/buddy/matches",
        expect=200,
        headers=auth,
        json_body={"text": "find buddies for Spiti in October trekking budget 20k"},
    )

    call("risks.list", "GET", "/v1/risks", expect=200, headers=auth, params={"city": "Delhi"})
    call("peaks.nearby", "GET", "/v1/peaks/nearby", expect=200, params={"latitude": 30.7, "longitude": 79.0})
    call("trails.list", "GET", "/v1/trails", expect=200)
    trails = call("trails.list_detail", "GET", "/v1/trails", expect=200)
    if trails and trails.status_code == 200 and trails.json():
        slug = trails.json()[0].get("slug") or trails.json()[0].get("id")
        if isinstance(slug, str) and not slug.startswith("d1a6"):
            call("trails.detail", "GET", f"/v1/trails/{slug}", expect={200, 404})
            call("trails.package", "GET", f"/v1/trails/{slug}/package", expect={200, 404})

    call(
        "guardian.create",
        "POST",
        "/v1/guardian/incidents",
        expect=201,
        headers=auth,
        json_body={"category": "other", "note": "Smoke test", "latitude": 28.61, "longitude": 77.21},
    )
    active = call("guardian.active", "GET", "/v1/guardian/incidents/active", expect=200, headers=auth)
    if active and active.status_code == 200 and active.json():
        iid = active.json()["id"]
        call("guardian.checkin", "POST", f"/v1/guardian/incidents/{iid}/checkin", expect=200, headers=auth, json_body={})
        call(
            "guardian.share",
            "POST",
            f"/v1/guardian/incidents/{iid}/share",
            expect=200,
            headers=auth,
            json_body={"latitude": 28.61, "longitude": 77.21},
        )
        call("guardian.resolve", "POST", f"/v1/guardian/incidents/{iid}/resolve", expect=200, headers=auth, json_body={})

    call(
        "explorer.apply",
        "POST",
        "/v1/explorer/apply",
        expect=201,
        headers=auth,
        json_body={"city": "Jaipur", "motivation": "I want to contribute careful observations for travelers."},
    )
    call("explorer.profile", "GET", "/v1/explorer/profile", expect=200, headers=auth)
    activated = call(
        "explorer.activate_pending",
        "POST",
        "/v1/explorer/activate",
        expect=200,
        headers=auth,
        json_body={"safetyAcknowledged": True},
    )
    if activated and activated.status_code == 200:
        status = activated.json().get("status")
        ok = status == "pending_review"
        record(
            "explorer.activate_requires_staff",
            "ASSERT",
            "/v1/explorer/activate",
            ok,
            200 if ok else 500,
            f"status={status}",
            0,
        )
        profile_id = activated.json().get("id")
        if profile_id:
            call(
                "moderation.explorer_approve",
                "POST",
                f"/v1/moderation/explorer-profiles/{profile_id}",
                expect=200,
                headers=staff_auth,
                json_body={"status": "active", "reviewerNote": "Smoke approve"},
            )
    call("explorer.missions", "GET", "/v1/explorer/missions", expect=200, headers=auth)
    missions = call("explorer.missions_for_submit", "GET", "/v1/explorer/missions", expect=200, headers=auth)
    if missions and missions.status_code == 200 and missions.json():
        mid = missions.json()[0]["id"]
        call(
            "explorer.submit",
            "POST",
            f"/v1/explorer/missions/{mid}/submissions",
            expect=201,
            headers=auth,
            json_body={"text": "Observed clear entrance signage and step-free access during daylight hours."},
        )
        call("explorer.submissions", "GET", "/v1/explorer/submissions", expect=200, headers=auth)

    call(
        "experts.profile",
        "POST",
        "/v1/experts/profile",
        expect=201,
        headers=auth,
        json_body={"displayName": "Smoke Expert", "city": "Jaipur", "specialties": ["heritage", "food"]},
    )
    call("experts.available", "GET", "/v1/experts/available", expect=200, headers=auth, params={"city": "Jaipur"})
    call(
        "experts.case",
        "POST",
        "/v1/experts/cases",
        expect=201,
        headers=auth,
        json_body={"city": "Jaipur", "category": "local_advice", "question": "Best time to visit Amber Fort?"},
    )
    call("experts.cases", "GET", "/v1/experts/cases", expect=200, headers=auth)

    call(
        "grocery.session",
        "POST",
        "/v1/grocery/blinkit/sessions",
        expect=201,
        headers=auth,
        json_body={"items": [{"name": "toothpaste"}, {"name": "usb-c charger"}]},
    )
    grocery = call(
        "grocery.session_create_for_get",
        "POST",
        "/v1/grocery/zepto/sessions",
        expect=201,
        headers=auth,
        json_body={"items": [{"name": "water"}]},
    )
    if grocery and grocery.status_code == 201:
        sid = grocery.json()["id"]
        call("grocery.get", "GET", f"/v1/grocery/sessions/{sid}", expect=200, headers=auth)

    call("onboarding.config", "GET", "/v1/onboarding/config", expect=200, headers=auth)
    call(
        "onboarding.call_without_twilio",
        "POST",
        "/v1/onboarding/calls",
        expect=503,
        headers=auth,
        json_body={"phoneNumber": "+919876543210", "callConsent": True, "recordingConsent": False},
    )
    call("onboarding.call_unauthenticated", "POST", "/v1/onboarding/calls", expect={401, 403}, json_body={"phoneNumber": "+919876543210", "callConsent": True})

    call("moderation.knowledge_queue", "GET", "/v1/moderation/knowledge/queue", expect=200, headers=staff_auth)

    call(
        "guide.identify_no_vision",
        "POST",
        "/v1/guide/identify",
        expect={422, 415, 503},
        headers=auth,
        files={"photo": ("x.txt", b"not-an-image", "text/plain")},
        data={"mode": "overview", "city": "Agra"},
    )

    passed = sum(1 for r in results if r["ok"])
    failed = sum(1 for r in results if not r["ok"])
    summary = {
        "base": BASE,
        "total": len(results),
        "passed": passed,
        "failed": failed,
        "passRate": round(100 * passed / max(len(results), 1), 1),
        "results": results,
    }
    OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\n=== SUMMARY {passed}/{len(results)} passed ({summary['passRate']}%) ===")
    print(f"Wrote {OUT}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
