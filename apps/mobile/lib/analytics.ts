/** Local-first analytics seam for Phase 0.
 * Events are bounded and persisted locally until a real Sentry/Amplitude project
 * is configured. This keeps product telemetry calls useful without inventing a
 * remote destination or leaking event payloads during development.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type GroceryProvider =
  | 'blinkit'
  | 'flipkart'
  | 'zepto'
  | 'swiggy_instamart'
  | 'bigbasket'
  | 'dmart'
  | 'jiomart'
  | 'licious'
  | 'freshtohome';
export type AnalyticsEvent = { name: string; properties: Record<string, string | number | boolean | null>; at: string };

const EVENT_KEY = 'zentrip.analytics.events.v1';

export async function track(name: string, properties: AnalyticsEvent['properties'] = {}): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(EVENT_KEY);
    const events = existing ? (JSON.parse(existing) as AnalyticsEvent[]) : [];
    events.push({ name, properties, at: new Date().toISOString() });
    await AsyncStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(-200)));
  } catch {
    // Telemetry must never break a traveler flow.
  }
}

export async function readLocalEvents(): Promise<AnalyticsEvent[]> {
  const raw = await AsyncStorage.getItem(EVENT_KEY);
  return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
}

export async function clearLocalEvents(): Promise<void> {
  await AsyncStorage.removeItem(EVENT_KEY);
}

const Analytics = {
  grocery: {
    platformOpened: (platform: GroceryProvider) => {
      void track('grocery.platformOpened', { platform });
    },
    exported: (platform: GroceryProvider, itemsCount?: number, uncheckedCount?: number) => {
      void track('grocery.exported', { platform, itemsCount: itemsCount ?? null, uncheckedCount: uncheckedCount ?? null });
    },
    platformTimeSpent: (
      platform: GroceryProvider,
      durationSeconds: number,
      itemsAdded: number,
      itemsSkipped: number,
    ) => {
      void track('grocery.platformTimeSpent', { platform, durationSeconds, itemsAdded, itemsSkipped });
    },
  },
};

export default Analytics;
