/**
 * Derive Compare / Booking form seeds from an active trip.
 * Never invents live fares — only cities and dates the traveler already chose.
 */

import type { ItineraryDay, Trip } from './trips';

export type TripPrefill = {
  origin: string;
  destination: string;
  stayCity: string;
  departureDate: string;
  checkIn: string;
  checkOut: string;
  budgetLevel: 'backpacker' | 'comfort' | 'luxury' | 'mixed';
  label: string;
  fromTrip: true;
  source: 'trip' | 'hop' | 'stay';
};

export type PrefillSearchParams = {
  origin?: string | string[];
  destination?: string | string[];
  stayCity?: string | string[];
  departureDate?: string | string[];
  checkIn?: string | string[];
  checkOut?: string | string[];
  budgetLevel?: string | string[];
  prefill?: string | string[];
  source?: string | string[];
};

const BUDGETS = new Set(['backpacker', 'comfort', 'luxury', 'mixed']);

function isoToday(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Prefer trip dates when start is today or later; otherwise nudge to today / +2 nights. */
function resolveDates(startDate: string, endDate: string): { departure: string; checkIn: string; checkOut: string } {
  const today = isoToday();
  const start = startDate >= today ? startDate : today;
  let end = endDate > start ? endDate : addDaysIso(start, 2);
  // Cap a single hop stay window to a few nights for booking handoff prefill.
  if (end > addDaysIso(start, 7)) {
    end = addDaysIso(start, 2);
  }
  return { departure: start, checkIn: start, checkOut: end };
}

export function prefillFromTrip(trip: Trip): TripPrefill | null {
  const cities = (trip.cities ?? []).map((c) => c.trim()).filter(Boolean);
  if (cities.length < 1) return null;

  const origin = cities[0];
  const destination = cities.length >= 2 ? cities[1] : cities[0];
  const stayCity = cities.length >= 2 ? cities[cities.length - 1] : cities[0];
  const { departure, checkIn, checkOut } = resolveDates(trip.startDate, trip.endDate);
  const budgetLevel = BUDGETS.has(trip.budgetLevel)
    ? (trip.budgetLevel as TripPrefill['budgetLevel'])
    : 'backpacker';

  const routeLabel =
    cities.length >= 2 ? `${origin} → ${destination}` : origin;

  return {
    origin,
    destination,
    stayCity,
    departureDate: departure,
    checkIn,
    checkOut,
    budgetLevel,
    label: `${routeLabel} · ${departure}`,
    fromTrip: true,
    source: 'trip',
  };
}

function asBudget(value?: string | null): TripPrefill['budgetLevel'] {
  return BUDGETS.has(value ?? '') ? (value as TripPrefill['budgetLevel']) : 'backpacker';
}

/**
 * One corridor hop: this day's city → the next different city.
 * Dates come from the itinerary when present — last night in origin, nights in dest.
 */
export function prefillFromHop(
  days: ItineraryDay[],
  dayIndex: number,
  budgetLevel?: string,
): TripPrefill | null {
  const originDay = days[dayIndex];
  if (!originDay) return null;
  const origin = originDay.city.trim();
  if (!origin) return null;

  let lastOriginIndex = dayIndex;
  let destIndex = -1;
  for (let i = dayIndex + 1; i < days.length; i += 1) {
    const city = days[i].city.trim();
    if (!city) continue;
    if (city.toLowerCase() === origin.toLowerCase()) {
      lastOriginIndex = i;
      continue;
    }
    destIndex = i;
    break;
  }
  if (destIndex < 0) return null;

  const destination = days[destIndex].city.trim();
  let destEnd = days[destIndex].date;
  for (let j = destIndex + 1; j < days.length; j += 1) {
    if (days[j].city.trim().toLowerCase() === destination.toLowerCase()) {
      destEnd = days[j].date;
    } else {
      break;
    }
  }

  const departure = days[lastOriginIndex].date || originDay.date;
  const stayDates = resolveDates(days[destIndex].date || departure, destEnd || departure);

  return {
    origin,
    destination,
    stayCity: destination,
    departureDate: departure >= isoToday() ? departure : stayDates.departure,
    checkIn: stayDates.checkIn,
    checkOut: stayDates.checkOut,
    budgetLevel: asBudget(budgetLevel),
    label: `${origin} → ${destination} · ${departure}`,
    fromTrip: true,
    source: 'hop',
  };
}

/** Last city (or a same-city day with no onward hop): stay dates only. */
export function stayPrefillFromDay(
  days: ItineraryDay[],
  dayIndex: number,
  budgetLevel?: string,
): TripPrefill | null {
  const day = days[dayIndex];
  if (!day?.city?.trim()) return null;
  const stayCity = day.city.trim();
  let end = day.date;
  for (let i = dayIndex + 1; i < days.length; i += 1) {
    if (days[i].city.trim().toLowerCase() === stayCity.toLowerCase()) {
      end = days[i].date;
    } else {
      break;
    }
  }
  const dates = resolveDates(day.date, end);
  return {
    origin: stayCity,
    destination: stayCity,
    stayCity,
    departureDate: dates.departure,
    checkIn: dates.checkIn,
    checkOut: dates.checkOut,
    budgetLevel: asBudget(budgetLevel),
    label: `Stays in ${stayCity} · ${dates.checkIn}`,
    fromTrip: true,
    source: 'stay',
  };
}

export function prefillSearchParams(seed: TripPrefill): Record<string, string> {
  return {
    origin: seed.origin,
    destination: seed.destination,
    stayCity: seed.stayCity,
    departureDate: seed.departureDate,
    checkIn: seed.checkIn,
    checkOut: seed.checkOut,
    budgetLevel: seed.budgetLevel,
    prefill: seed.label,
    source: seed.source,
  };
}

export function prefillFromSearchParams(params: PrefillSearchParams): TripPrefill | null {
  const origin = firstSearchParam(params.origin);
  const destination = firstSearchParam(params.destination);
  const stayCity = firstSearchParam(params.stayCity);
  if (!origin && !destination && !stayCity) return null;

  const departureDate = firstSearchParam(params.departureDate);
  const checkIn = firstSearchParam(params.checkIn);
  const checkOut = firstSearchParam(params.checkOut);
  const sourceRaw = firstSearchParam(params.source);
  const source: TripPrefill['source'] =
    sourceRaw === 'hop' || sourceRaw === 'stay' || sourceRaw === 'trip' ? sourceRaw : origin && destination && origin !== destination ? 'hop' : 'stay';
  const from = origin || stayCity;
  const to = destination || stayCity;
  if (!from || !to) return null;
  const dates = resolveDates(departureDate || checkIn || isoToday(), checkOut || addDaysIso(departureDate || checkIn || isoToday(), 2));

  return {
    origin: from,
    destination: to,
    stayCity: stayCity || (source === 'stay' ? from : to),
    departureDate: departureDate || dates.departure,
    checkIn: checkIn || dates.checkIn,
    checkOut: checkOut && checkOut > (checkIn || dates.checkIn) ? checkOut : dates.checkOut,
    budgetLevel: asBudget(firstSearchParam(params.budgetLevel)),
    label: firstSearchParam(params.prefill) || `${from} → ${to}`,
    fromTrip: true,
    source,
  };
}

/** Approximate lat/lng box covering Delhi–Agra–Jaipur plains (not Himalaya). */
export function isGoldenTrianglePlains(latitude: number, longitude: number): boolean {
  return latitude >= 26.0 && latitude <= 29.6 && longitude >= 74.4 && longitude <= 79.2;
}

const CORRIDOR = new Set(['delhi', 'agra', 'jaipur']);
const CORRIDOR_CITIES = ['Delhi', 'Agra', 'Jaipur'] as const;

export type CorridorCity = (typeof CORRIDOR_CITIES)[number];

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export function matchCorridorCity(city?: string | null): CorridorCity | null {
  if (!city) return null;
  const needle = city.trim().toLowerCase();
  return CORRIDOR_CITIES.find((item) => item.toLowerCase() === needle) ?? null;
}

export function tripLooksLikeGoldenTriangle(trip: Trip | null | undefined): boolean {
  if (!trip?.cities?.length) return false;
  return trip.cities.every((city) => CORRIDOR.has(city.trim().toLowerCase()));
}
