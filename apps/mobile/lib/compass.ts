import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

async function readLocationHeading(timeoutMs: number): Promise<number | undefined> {
  try {
    return await new Promise((resolve) => {
      let settled = false;
      let sub: Location.LocationSubscription | undefined;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        sub?.remove();
        resolve(undefined);
      }, timeoutMs);
      Location.watchHeadingAsync((heading) => {
        const raw = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
        if (!Number.isFinite(raw) || settled) return;
        settled = true;
        clearTimeout(timer);
        sub?.remove();
        resolve(normalizeDegrees(raw));
      })
        .then((subscription) => {
          sub = subscription;
          if (settled) subscription.remove();
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(undefined);
        });
    });
  } catch {
    return undefined;
  }
}

async function readMagnetometerHeading(timeoutMs: number): Promise<number | undefined> {
  try {
    const available = await Magnetometer.isAvailableAsync();
    if (!available) return undefined;
    Magnetometer.setUpdateInterval(200);
    return await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        sub.remove();
        resolve(undefined);
      }, timeoutMs);
      const sub = Magnetometer.addListener(({ x, y }) => {
        if (settled) return;
        const heading = Math.atan2(y, x) * (180 / Math.PI);
        if (!Number.isFinite(heading)) return;
        settled = true;
        clearTimeout(timer);
        sub.remove();
        resolve(normalizeDegrees(heading));
      });
    });
  } catch {
    return undefined;
  }
}

export async function readCompassHeading(timeoutMs = 3500): Promise<number | undefined> {
  const fromLocation = await readLocationHeading(timeoutMs);
  if (fromLocation !== undefined) return fromLocation;
  return readMagnetometerHeading(timeoutMs);
}
