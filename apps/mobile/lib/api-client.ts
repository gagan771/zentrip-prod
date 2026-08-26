import * as SecureStore from 'expo-secure-store';

/**
 * Single typed API client — the one thing every feature talks to the backend through.
 * Mirrors the JWT+OTP refresh pattern already used by kmkb-mobile-app's utils/api.ts,
 * so absorbing that app in Phase 2 (see 05-india-services-layer-grocery-integration.md)
 * doesn't mean running two auth systems side by side.
 *
 * For physical Android/iOS devices, EXPO_PUBLIC_API_BASE_URL must point to the
 * computer's LAN address; localhost refers to the device itself.
 */

const ACCESS_TOKEN_KEY = 'zentrip.accessToken';
const REFRESH_TOKEN_KEY = 'zentrip.refreshToken';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearAuthTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await clearAuthTokens();
    return null;
  }

  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  await setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/**
 * Fetch wrapper: attaches the access token, retries once on 401 after a refresh,
 * and always throws on a non-OK response so callers don't have to check res.ok themselves.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const accessToken = await getAccessToken();

  const doFetch = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response = await doFetch(accessToken);

  if (response.status === 401) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      response = await doFetch(newAccessToken);
    }
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`API ${response.status}: ${message}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Multipart variant for voice/image uploads. Do not set Content-Type here: React
 * Native must add the multipart boundary itself.
 */
export async function apiFormRequest<T>(path: string, form: FormData, options: Omit<RequestInit, 'body'> = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const doFetch = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: options.method ?? 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: form,
    });

  let response = await doFetch(accessToken);
  if (response.status === 401) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) response = await doFetch(newAccessToken);
  }
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`API ${response.status}: ${message}`);
  }
  return (await response.json()) as T;
}
