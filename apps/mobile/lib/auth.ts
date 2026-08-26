import * as AuthSession from 'expo-auth-session';

import { apiRequest, clearAuthTokens, setTokens } from './api-client';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  language: string;
  country: string | null;
};

/**
 * Local-only escape hatch for trying the app when the API is unavailable. It never
 * creates tokens or an account; backend-backed actions continue to require sign-in.
 */
export function guestUser(): AuthUser {
  return {
    id: 'guest',
    email: 'guest@local.zentrip',
    name: 'Guest traveler',
    language: 'en',
    country: null,
  };
}

type TokenResponse = { accessToken: string; refreshToken: string };

async function meAfterTokens(tokens: TokenResponse): Promise<AuthUser> {
  await setTokens(tokens.accessToken, tokens.refreshToken);
  return apiRequest<AuthUser>('/v1/auth/me');
}

export async function registerWithEmail(email: string, password: string, name: string): Promise<AuthUser> {
  const tokens = await apiRequest<TokenResponse>('/v1/auth/register', {
    method: 'POST',
    body: { email, password, name },
  });
  return meAfterTokens(tokens);
}

export async function loginWithEmail(email: string, password: string): Promise<AuthUser> {
  const tokens = await apiRequest<TokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return meAfterTokens(tokens);
}

export async function logout(): Promise<void> {
  await clearAuthTokens();
}

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

/**
 * Google sign-in via expo-auth-session (system browser + PKCE) — works in plain Expo Go,
 * unlike the native @react-native-google-signin/google-signin SDK, which needs a dev client.
 *
 * Requires EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB (a "Web application" OAuth client ID from Google
 * Cloud Console — used here because it's the one type that supports this redirect flow from
 * Expo Go without a custom native scheme). Until that env var is set, this throws clearly
 * rather than silently failing.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;
  if (!clientId) {
    throw new Error(
      'Google sign-in is not configured yet: set EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB in .env (see .env.example).'
    );
  }

  const redirectUri = AuthSession.makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['openid', 'email', 'profile'],
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    extraParams: { nonce: Math.random().toString(36).slice(2) },
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type !== 'success' || !result.params.id_token) {
    throw new Error('Google sign-in was cancelled or did not return an ID token.');
  }

  const tokens = await apiRequest<TokenResponse>('/v1/auth/google', {
    method: 'POST',
    body: { idToken: result.params.id_token },
  });
  return meAfterTokens(tokens);
}
