/**
 * Google Play API client — multi-API integration.
 *
 * Uses a Service Account key (JSON) stored in system settings.
 * Required setting: GOOGLE_PLAY_SERVICE_ACCOUNT_KEY (JSON string)
 *
 * Supported APIs (enable in Google Cloud Console):
 *   - Google Play Android Developer API (androidpublisher v3)
 *   - Google Play Developer Reporting API (v1beta1)
 *   - Google Play Integrity API (v1)
 *   - Google Play Custom App Publishing API (v1)
 *   - Google Play Games Services Management API (v1management)
 *   - Google Play Games Services Publishing API (v1configuration)
 *   - Google Play Grouping API (v1alpha1)
 */

import { getGooglePlayConfig } from "@/lib/settings";
import crypto from "crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PLAY_API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const REPORTING_API_BASE = "https://playdeveloperreporting.googleapis.com/v1beta1";
const INTEGRITY_API_BASE = "https://playintegrity.googleapis.com/v1";
const CUSTOM_APP_API_BASE = "https://playcustomapp.googleapis.com/playcustomapp/v1";
const GAMES_MGMT_API_BASE = "https://gamesManagement.googleapis.com/games/v1management";
const GAMES_CONFIG_API_BASE = "https://gamesconfiguration.googleapis.com/games/v1configuration";
const GROUPING_API_BASE = "https://playgrouping.googleapis.com/v1alpha1";

const ALL_SCOPES = [
  "https://www.googleapis.com/auth/androidpublisher",
  "https://www.googleapis.com/auth/playdeveloperreporting",
  "https://www.googleapis.com/auth/playintegrity",
  "https://www.googleapis.com/auth/games",
].join(" ");

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
      scope: ALL_SCOPES,
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

/** Generic authenticated fetch against any Google API */
async function googleFetch(url: string, options: RequestInit = {}) {
  const saKey = await getServiceAccountKey();
  if (!saKey) throw new Error("Google Play not configured");

  const token = await getAccessToken(saKey);
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function playFetch(endpoint: string, options: RequestInit = {}) {
  return googleFetch(`${PLAY_API_BASE}${endpoint}`, options);
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

// ─── App Listing Details (title, icon, etc.) ─────────

export interface AppListingInfo {
  packageName: string;
  title: string;
  shortDescription?: string;
  fullDescription?: string;
  iconUrl?: string;
  storeUrl: string;
}

/**
 * Fetch store listing info (title, descriptions) from the Edits API.
 * Tries en-US first, then falls back to the first available listing.
 */
export async function getAppListing(packageName: string): Promise<AppListingInfo | null> {
  const edit = await playFetch(`/applications/${packageName}/edits`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  try {
    // Try to get the listing for default language first
    const listings = await playFetch(
      `/applications/${packageName}/edits/${edit.id}/listings`
    );

    const listingsArr = listings.listings || [];
    // Prefer en-US, en-GB, then any
    const listing =
      listingsArr.find((l: { language: string }) => l.language === "en-US") ||
      listingsArr.find((l: { language: string }) => l.language?.startsWith("en")) ||
      listingsArr[0];

    if (!listing) return null;

    // Try to get the app icon
    let iconUrl: string | undefined;
    try {
      const images = await playFetch(
        `/applications/${packageName}/edits/${edit.id}/listings/${listing.language}/images/icon`
      );
      if (images.images?.[0]?.url) {
        iconUrl = images.images[0].url;
      }
    } catch {
      // Icon fetch is optional
    }

    return {
      packageName,
      title: listing.title || packageName,
      shortDescription: listing.shortDescription || undefined,
      fullDescription: listing.fullDescription || undefined,
      iconUrl,
      storeUrl: `https://play.google.com/store/apps/details?id=${packageName}`,
    };
  } catch {
    return null;
  } finally {
    await playFetch(`/applications/${packageName}/edits/${edit.id}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}

/**
 * Fetch listing info for multiple package names.
 * Returns results for packages that were accessible (owned by the service account).
 */
export async function getAppListings(packageNames: string[]): Promise<AppListingInfo[]> {
  const results: AppListingInfo[] = [];
  for (const pkg of packageNames) {
    try {
      const info = await getAppListing(pkg.trim());
      if (info) results.push(info);
    } catch {
      // Skip packages that fail (not owned, invalid name, etc.)
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// Google Play Developer Reporting API (v1beta1)
// ═══════════════════════════════════════════════════════

export interface ReportingMetricRow {
  startTime?: { year: number; month: number; day: number };
  endTime?: { year: number; month: number; day: number };
  metrics: Record<string, { decimalValue?: { value: string }; int64Value?: string }>;
  dimensions?: Record<string, { stringValue?: string; int64Value?: string }>;
}

export interface ReportingQueryResult {
  rows: ReportingMetricRow[];
}

function buildTimelineSpec(startDate: string, endDate: string) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return {
    startTime: {
      year: s.getUTCFullYear(),
      month: s.getUTCMonth() + 1,
      day: s.getUTCDate(),
    },
    endTime: {
      year: e.getUTCFullYear(),
      month: e.getUTCMonth() + 1,
      day: e.getUTCDate(),
    },
  };
}

/** Fetch crash rate metrics for a package */
export async function getCrashRateMetrics(
  packageName: string,
  startDate: string,
  endDate: string
): Promise<ReportingQueryResult> {
  return googleFetch(
    `${REPORTING_API_BASE}/apps/${packageName}/crashRateMetricSet:query`,
    {
      method: "POST",
      body: JSON.stringify({
        timelineSpec: buildTimelineSpec(startDate, endDate),
        metrics: ["crashRate", "userPerceivedCrashRate", "distinctUsers"],
        dimensions: ["apiLevel"],
      }),
    }
  );
}

/** Fetch ANR rate metrics for a package */
export async function getAnrRateMetrics(
  packageName: string,
  startDate: string,
  endDate: string
): Promise<ReportingQueryResult> {
  return googleFetch(
    `${REPORTING_API_BASE}/apps/${packageName}/anrRateMetricSet:query`,
    {
      method: "POST",
      body: JSON.stringify({
        timelineSpec: buildTimelineSpec(startDate, endDate),
        metrics: ["anrRate", "userPerceivedAnrRate", "distinctUsers"],
        dimensions: ["apiLevel"],
      }),
    }
  );
}

/** Fetch excessive wakeup rate metrics */
export async function getExcessiveWakeupMetrics(
  packageName: string,
  startDate: string,
  endDate: string
): Promise<ReportingQueryResult> {
  return googleFetch(
    `${REPORTING_API_BASE}/apps/${packageName}/excessiveWakeupRateMetricSet:query`,
    {
      method: "POST",
      body: JSON.stringify({
        timelineSpec: buildTimelineSpec(startDate, endDate),
        metrics: ["excessiveWakeupRate", "distinctUsers"],
      }),
    }
  );
}

/** Fetch stuck background wakelocks rate */
export async function getStuckWakelockMetrics(
  packageName: string,
  startDate: string,
  endDate: string
): Promise<ReportingQueryResult> {
  return googleFetch(
    `${REPORTING_API_BASE}/apps/${packageName}/stuckBackgroundWakelockRateMetricSet:query`,
    {
      method: "POST",
      body: JSON.stringify({
        timelineSpec: buildTimelineSpec(startDate, endDate),
        metrics: ["stuckBgWakelockRate", "distinctUsers"],
      }),
    }
  );
}

/** Search error reports for a package */
export async function searchErrorReports(
  packageName: string,
  filter?: string,
  pageSize = 50,
  pageToken?: string
): Promise<{ errorReports: ErrorReport[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (filter) params.set("filter", filter);
  if (pageToken) params.set("pageToken", pageToken);
  return googleFetch(
    `${REPORTING_API_BASE}/apps/${packageName}/errorReports:search?${params}`
  );
}

export interface ErrorReport {
  name: string;
  type: string; // CRASH, ANR
  reportText: string;
  issue: string;
  eventTime: string;
  deviceModel?: { marketingName: string; deviceId: string };
  osVersion?: { apiLevel: number };
}

/** Search error issues (grouped error clusters) */
export async function searchErrorIssues(
  packageName: string,
  filter?: string,
  pageSize = 50,
  pageToken?: string
): Promise<{ errorIssues: ErrorIssue[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (filter) params.set("filter", filter);
  if (pageToken) params.set("pageToken", pageToken);
  return googleFetch(
    `${REPORTING_API_BASE}/apps/${packageName}/errorIssues:search?${params}`
  );
}

export interface ErrorIssue {
  name: string;
  type: string;
  errorReportCount: string;
  cause: string;
  distinctUsers: string;
  firstOsVersion?: { apiLevel: number };
  lastOsVersion?: { apiLevel: number };
  location?: string;
  firstAppVersion?: { versionCode: string };
  lastAppVersion?: { versionCode: string };
}

// ═══════════════════════════════════════════════════════
// Google Play Integrity API (v1)
// ═══════════════════════════════════════════════════════

export interface IntegrityVerdict {
  tokenPayloadExternal: {
    requestDetails?: {
      requestPackageName: string;
      timestampMillis: string;
      nonce: string;
    };
    appIntegrity?: {
      appRecognitionVerdict: string; // PLAY_RECOGNIZED, UNRECOGNIZED_VERSION, UNEVALUATED
      packageName: string;
      certificateSha256Digest: string[];
      versionCode: string;
    };
    deviceIntegrity?: {
      deviceRecognitionVerdict: string[]; // MEETS_DEVICE_INTEGRITY, MEETS_BASIC_INTEGRITY, etc.
    };
    accountDetails?: {
      appLicensingVerdict: string; // LICENSED, UNLICENSED, UNEVALUATED
    };
  };
}

/** Decode and verify a Play Integrity token */
export async function decodeIntegrityToken(
  packageName: string,
  integrityToken: string
): Promise<IntegrityVerdict> {
  return googleFetch(
    `${INTEGRITY_API_BASE}/${packageName}:decodeIntegrityToken`,
    {
      method: "POST",
      body: JSON.stringify({ integrity_token: integrityToken }),
    }
  );
}

// ═══════════════════════════════════════════════════════
// Google Play Android Developer API — In-App Products
// ═══════════════════════════════════════════════════════

export interface InAppProduct {
  packageName: string;
  sku: string;
  status: string;
  purchaseType: string; // managedUser, subscription
  defaultPrice: { priceMicros: string; currency: string };
  listings: Record<string, { title: string; description: string }>;
  defaultLanguage: string;
}

/** List in-app products for a package */
export async function listInAppProducts(
  packageName: string,
  maxResults = 100,
  startIndex = 0
): Promise<{ inappproduct: InAppProduct[]; tokenPagination?: { nextPageToken: string } }> {
  return playFetch(
    `/applications/${packageName}/inappproducts?maxResults=${maxResults}&startIndex=${startIndex}`
  );
}

/** Get a single in-app product */
export async function getInAppProduct(
  packageName: string,
  sku: string
): Promise<InAppProduct> {
  return playFetch(`/applications/${packageName}/inappproducts/${sku}`);
}

// ═══════════════════════════════════════════════════════
// Google Play Android Developer API — Subscriptions v2
// ═══════════════════════════════════════════════════════

export interface Subscription {
  productId: string;
  basePlans: {
    basePlanId: string;
    state: string;
    prices: { regionCode: string; priceMicros: string; currencyCode: string }[];
    renewalType: string;
    autoRenewingBasePlanType?: { billingPeriodDuration: string };
    prepaidBasePlanType?: { timeExtension: string };
  }[];
  listings: { languageCode: string; title: string; description?: string; benefits?: string[] }[];
  packageName: string;
}

/** List subscriptions for a package */
export async function listSubscriptions(
  packageName: string,
  pageSize = 100,
  pageToken?: string
): Promise<{ subscriptions: Subscription[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set("pageToken", pageToken);
  return playFetch(
    `/applications/${packageName}/subscriptions?${params}`
  );
}

/** Get a single subscription */
export async function getSubscription(
  packageName: string,
  productId: string
): Promise<Subscription> {
  return playFetch(`/applications/${packageName}/subscriptions/${productId}`);
}

// ═══════════════════════════════════════════════════════
// Google Play Custom App Publishing API (v1)
// ═══════════════════════════════════════════════════════

export interface CustomApp {
  packageName?: string;
  title: string;
  languageCode?: string;
  organizationId?: string;
}

/** Create a custom app for a managed Google Play account */
export async function createCustomApp(
  accountId: string,
  title: string,
  languageCode = "en-US"
): Promise<CustomApp> {
  return googleFetch(
    `${CUSTOM_APP_API_BASE}/accounts/${accountId}/customApps`,
    {
      method: "POST",
      body: JSON.stringify({ title, languageCode }),
    }
  );
}

/** List custom apps for an account (via androidpublisher) */
export async function listCustomApps(
  accountId: string
): Promise<CustomApp[]> {
  const data = await googleFetch(
    `${CUSTOM_APP_API_BASE}/accounts/${accountId}/customApps`
  );
  return data.customApps || [];
}

// ═══════════════════════════════════════════════════════
// Google Play Games Services Management API (v1management)
// ═══════════════════════════════════════════════════════

export interface GamePlayer {
  playerId: string;
  displayName?: string;
  avatarImageUrl?: string;
  profileSettings?: { profileVisible: boolean };
  experienceInfo?: { currentLevel: { level: number }; currentExperiencePoints: string };
}

/** Reset achievement progress for a player (management) */
export async function resetAchievementForPlayer(
  achievementId: string,
  playerId: string
): Promise<void> {
  await googleFetch(
    `${GAMES_MGMT_API_BASE}/achievements/${achievementId}/resetForPlayer?playerId=${playerId}`,
    { method: "POST" }
  );
}

/** Reset all achievements for all players (management) */
export async function resetAllAchievements(): Promise<void> {
  await googleFetch(
    `${GAMES_MGMT_API_BASE}/achievements/resetAll`,
    { method: "POST" }
  );
}

/** Reset events for all players (management) */
export async function resetAllEvents(): Promise<void> {
  await googleFetch(
    `${GAMES_MGMT_API_BASE}/events/resetAll`,
    { method: "POST" }
  );
}

/** Reset scores on a leaderboard for all players */
export async function resetLeaderboard(leaderboardId: string): Promise<void> {
  await googleFetch(
    `${GAMES_MGMT_API_BASE}/leaderboards/${leaderboardId}/scores/resetAll`,
    { method: "POST" }
  );
}

// ═══════════════════════════════════════════════════════
// Google Play Games Services Publishing API (v1configuration)
// ═══════════════════════════════════════════════════════

export interface AchievementConfiguration {
  id?: string;
  achievementType: string; // STANDARD, INCREMENTAL
  initialState: string; // HIDDEN, REVEALED, UNLOCKED
  stepsToUnlock?: number;
  token?: string;
  draft?: {
    name: { kind: string; translations: { locale: string; value: string }[] };
    description: { kind: string; translations: { locale: string; value: string }[] };
    pointValue: number;
    iconUrl?: string;
    sortRank: number;
  };
  published?: {
    name: { kind: string; translations: { locale: string; value: string }[] };
    description: { kind: string; translations: { locale: string; value: string }[] };
    pointValue: number;
    iconUrl?: string;
    sortRank: number;
  };
}

/** List achievement configurations for a game app */
export async function listAchievementConfigs(
  applicationId: string,
  maxResults = 200,
  pageToken?: string
): Promise<{ items: AchievementConfiguration[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) params.set("pageToken", pageToken);
  return googleFetch(
    `${GAMES_CONFIG_API_BASE}/applications/${applicationId}/achievements?${params}`
  );
}

/** Get a single achievement configuration */
export async function getAchievementConfig(
  achievementId: string
): Promise<AchievementConfiguration> {
  return googleFetch(
    `${GAMES_CONFIG_API_BASE}/achievements/${achievementId}`
  );
}

export interface LeaderboardConfiguration {
  id?: string;
  token?: string;
  scoreOrder: string; // LARGER_IS_BETTER, SMALLER_IS_BETTER
  scoreMin?: string;
  scoreMax?: string;
  draft?: {
    name: { kind: string; translations: { locale: string; value: string }[] };
    iconUrl?: string;
    sortRank: number;
    scoreFormat: { numberFormatType: string };
  };
  published?: {
    name: { kind: string; translations: { locale: string; value: string }[] };
    iconUrl?: string;
    sortRank: number;
    scoreFormat: { numberFormatType: string };
  };
}

/** List leaderboard configurations for a game app */
export async function listLeaderboardConfigs(
  applicationId: string,
  maxResults = 200,
  pageToken?: string
): Promise<{ items: LeaderboardConfiguration[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) params.set("pageToken", pageToken);
  return googleFetch(
    `${GAMES_CONFIG_API_BASE}/applications/${applicationId}/leaderboards?${params}`
  );
}

/** Get a single leaderboard configuration */
export async function getLeaderboardConfig(
  leaderboardId: string
): Promise<LeaderboardConfiguration> {
  return googleFetch(
    `${GAMES_CONFIG_API_BASE}/leaderboards/${leaderboardId}`
  );
}

// ═══════════════════════════════════════════════════════
// Google Play Grouping API (v1alpha1)
// ═══════════════════════════════════════════════════════

export interface AppGroupTag {
  tag: string;
  booleanValue?: boolean;
  int64Value?: string;
  stringValue?: string;
  timeValue?: string;
}

/** Verify a token for the Grouping API (used for user grouping) */
export async function verifyGroupingToken(
  appPackage: string,
  token: string
): Promise<{ tag?: string }> {
  return googleFetch(
    `${GROUPING_API_BASE}/apps/${appPackage}/tokens/${encodeURIComponent(token)}:verify`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Create or update a tag for a token */
export async function createOrUpdateTag(
  appPackage: string,
  token: string,
  tag: string,
  value: string
): Promise<AppGroupTag> {
  return googleFetch(
    `${GROUPING_API_BASE}/apps/${appPackage}/tokens/${encodeURIComponent(token)}/tags/${tag}`,
    {
      method: "PUT",
      body: JSON.stringify({ stringValue: value }),
    }
  );
}

/** List tags for a token */
export async function listGroupTags(
  appPackage: string,
  token: string
): Promise<{ tags: AppGroupTag[] }> {
  return googleFetch(
    `${GROUPING_API_BASE}/apps/${appPackage}/tokens/${encodeURIComponent(token)}/tags`
  );
}
