/**
 * Google Play Developer API client.
 *
 * Uses a Service Account key (JSON) stored in system settings.
 * Required setting: GOOGLE_PLAY_SERVICE_ACCOUNT_KEY (JSON string)
 *
 * Google Play Developer API v3:
 *   - Stats via Play Developer Reporting API (requires Google Cloud export)
 *   - Build/track status via Edits API
 */

import { getGooglePlayConfig } from "@/lib/settings";
import crypto from "crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PLAY_API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

async function getAccessToken(saKey: ServiceAccountKey): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: saKey.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: saKey.token_uri || GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(saKey.private_key, "base64url");
  const jwt = `${signInput}.${signature}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth error ${res.status}: ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

async function getServiceAccountKey(): Promise<ServiceAccountKey | null> {
  const config = await getGooglePlayConfig();
  const keyJson = config.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return null;
  try {
    return JSON.parse(keyJson);
  } catch {
    return null;
  }
}

export async function isGooglePlayConfigured(): Promise<boolean> {
  const key = await getServiceAccountKey();
  return key !== null;
}

async function playFetch(endpoint: string, options: RequestInit = {}) {
  const saKey = await getServiceAccountKey();
  if (!saKey) throw new Error("Google Play not configured");

  const token = await getAccessToken(saKey);
  const res = await fetch(`${PLAY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Play API ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Track / Release Management ──────────────────────

export interface GooglePlayTrack {
  track: string; // production, beta, alpha, internal
  releases: {
    name?: string;
    versionCodes: string[];
    status: string; // completed, inProgress, draft, halted
    releaseNotes?: { language: string; text: string }[];
  }[];
}

export async function listTracks(packageName: string): Promise<GooglePlayTrack[]> {
  // Create an edit to read track info
  const edit = await playFetch(`/applications/${packageName}/edits`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  const data = await playFetch(
    `/applications/${packageName}/edits/${edit.id}/tracks`
  );

  // Clean up the edit
  await playFetch(`/applications/${packageName}/edits/${edit.id}`, {
    method: "DELETE",
  }).catch(() => {});

  return data.tracks || [];
}

export async function getTrackInfo(
  packageName: string,
  track: string
): Promise<GooglePlayTrack | null> {
  const edit = await playFetch(`/applications/${packageName}/edits`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  try {
    const data = await playFetch(
      `/applications/${packageName}/edits/${edit.id}/tracks/${track}`
    );
    return data;
  } catch {
    return null;
  } finally {
    await playFetch(`/applications/${packageName}/edits/${edit.id}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}

// ─── Reviews ─────────────────────────────────────────

export interface GooglePlayReview {
  reviewId: string;
  authorName: string;
  comments: {
    userComment?: {
      text: string;
      starRating: number;
      lastModified: { seconds: string };
    };
  }[];
}

export async function listReviews(
  packageName: string,
  maxResults = 20
): Promise<GooglePlayReview[]> {
  const data = await playFetch(
    `/applications/${packageName}/reviews?maxResults=${maxResults}`
  );
  return data.reviews || [];
}

// ─── App Details (for basic info) ────────────────────

export async function getAppDetails(packageName: string) {
  const edit = await playFetch(`/applications/${packageName}/edits`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  try {
    const details = await playFetch(
      `/applications/${packageName}/edits/${edit.id}/details`
    );
    return details;
  } catch {
    return null;
  } finally {
    await playFetch(`/applications/${packageName}/edits/${edit.id}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}
