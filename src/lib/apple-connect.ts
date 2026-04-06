/**
 * Apple App Store Connect API client.
 *
 * Uses a private key + key ID + issuer ID for JWT auth.
 * Required settings:
 *   APPLE_CONNECT_KEY_ID — API key ID from App Store Connect
 *   APPLE_CONNECT_ISSUER_ID — Issuer ID from App Store Connect
 *   APPLE_CONNECT_PRIVATE_KEY — PKCS8 .p8 private key contents
 *
 * App Store Connect API v1:
 *   - Build status via /builds endpoint
 *   - App info via /apps endpoint
 *   - Sales/trends via /salesReports endpoint
 */

import { getAppleConnectConfig } from "@/lib/settings";
import crypto from "crypto";

const ASC_API_BASE = "https://api.appstoreconnect.apple.com/v1";

interface AppleConnectCredentials {
  keyId: string;
  issuerId: string;
  privateKey: string;
}

let cachedJwt: { token: string; expiresAt: number } | null = null;

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

function generateJwt(creds: AppleConnectCredentials): string {
  if (cachedJwt && Date.now() < cachedJwt.expiresAt - 60_000) {
    return cachedJwt.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: creds.keyId, typ: "JWT" })
  );
  const payload = base64url(
    JSON.stringify({
      iss: creds.issuerId,
      iat: now,
      exp: now + 1200, // 20 minutes
      aud: "appstoreconnect-v1",
    })
  );

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signInput);
  const signature = sign.sign(
    { key: creds.privateKey, dsaEncoding: "ieee-p1363" },
    "base64url"
  );

  const jwt = `${signInput}.${signature}`;
  cachedJwt = { token: jwt, expiresAt: Date.now() + 1200 * 1000 };
  return jwt;
}

async function getCredentials(): Promise<AppleConnectCredentials | null> {
  const config = await getAppleConnectConfig();
  const keyId = config.APPLE_CONNECT_KEY_ID;
  const issuerId = config.APPLE_CONNECT_ISSUER_ID;
  const privateKey = config.APPLE_CONNECT_PRIVATE_KEY;
  if (!keyId || !issuerId || !privateKey) return null;
  return { keyId, issuerId, privateKey };
}

export async function isAppleConnectConfigured(): Promise<boolean> {
  const creds = await getCredentials();
  return creds !== null;
}

async function ascFetch(endpoint: string, options: RequestInit = {}) {
  const creds = await getCredentials();
  if (!creds) throw new Error("Apple App Store Connect not configured");

  const token = generateJwt(creds);
  const url = endpoint.startsWith("http") ? endpoint : `${ASC_API_BASE}${endpoint}`;

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
    throw new Error(`App Store Connect API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Apps ────────────────────────────────────────────

export interface AppleApp {
  id: string;
  attributes: {
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
  };
}

export async function listApps(): Promise<AppleApp[]> {
  const data = await ascFetch("/apps?limit=200");
  return data.data || [];
}

export async function getApp(appId: string): Promise<AppleApp | null> {
  try {
    const data = await ascFetch(`/apps/${appId}`);
    return data.data || null;
  } catch {
    return null;
  }
}

// ─── Builds ──────────────────────────────────────────

export interface AppleBuild {
  id: string;
  attributes: {
    version: string;
    uploadedDate: string;
    processingState: string; // PROCESSING, FAILED, INVALID, VALID
    minOsVersion: string;
    iconAssetToken?: { templateUrl: string };
    buildAudienceType?: string;
  };
}

export interface AppleBuildBetaDetail {
  id: string;
  attributes: {
    externalBuildState: string; // PROCESSING, IN_BETA_REVIEW, IN_EXPORT_COMPLIANCE_REVIEW, MISSING_EXPORT_COMPLIANCE, READY_FOR_BETA_TESTING, BETA_REJECTED
    internalBuildState: string;
  };
}

export async function listBuilds(
  appId: string,
  limit = 20
): Promise<AppleBuild[]> {
  const data = await ascFetch(
    `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=${limit}&include=buildBetaDetail`
  );
  return data.data || [];
}

export async function getBuild(buildId: string): Promise<AppleBuild | null> {
  try {
    const data = await ascFetch(`/builds/${buildId}`);
    return data.data || null;
  } catch {
    return null;
  }
}

// ─── App Store Versions (submission status) ──────────

export interface AppleAppStoreVersion {
  id: string;
  attributes: {
    versionString: string;
    appStoreState: string; // ACCEPTED, DEVELOPER_REMOVED_FROM_SALE, DEVELOPER_REJECTED, IN_REVIEW, INVALID_BINARY, METADATA_REJECTED, PENDING_APPLE_RELEASE, PENDING_CONTRACT, PENDING_DEVELOPER_RELEASE, PREPARE_FOR_SUBMISSION, PREORDER_READY_FOR_SALE, PROCESSING_FOR_APP_STORE, READY_FOR_REVIEW, READY_FOR_SALE, REJECTED, REMOVED_FROM_SALE, WAITING_FOR_EXPORT_COMPLIANCE, WAITING_FOR_REVIEW, REPLACED_WITH_NEW_VERSION, NOT_APPLICABLE
    platform: string; // IOS, MAC_OS, TV_OS
    createdDate: string;
    releaseType: string; // MANUAL, AFTER_APPROVAL, SCHEDULED
  };
}

export async function listAppStoreVersions(
  appId: string,
  limit = 10
): Promise<AppleAppStoreVersion[]> {
  const data = await ascFetch(
    `/apps/${appId}/appStoreVersions?limit=${limit}&sort=-createdDate`
  );
  return data.data || [];
}

// ─── Sales & Trends Reports ─────────────────────────

export async function getSalesReport(params: {
  vendorNumber: string;
  reportDate: string; // YYYY-MM-DD
  reportType?: string; // Sales, Subscription, etc.
}): Promise<string> {
  const reportType = params.reportType || "Sales";
  const url = `https://api.appstoreconnect.apple.com/v1/salesReports?filter[vendorNumber]=${params.vendorNumber}&filter[reportDate]=${params.reportDate}&filter[reportType]=${reportType}&filter[reportSubType]=Summary&filter[frequency]=Daily`;

  const creds = await getCredentials();
  if (!creds) throw new Error("Apple App Store Connect not configured");

  const token = generateJwt(creds);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/a-gzip",
    },
  });

  if (!res.ok) {
    if (res.status === 404) return ""; // No data for this date
    const text = await res.text();
    throw new Error(`Sales API ${res.status}: ${text}`);
  }

  // Response is gzipped TSV
  const buffer = await res.arrayBuffer();
  const { gunzipSync } = await import("zlib");
  const decompressed = gunzipSync(Buffer.from(buffer));
  return decompressed.toString("utf-8");
}
