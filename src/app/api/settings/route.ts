import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSettings, setSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const ALLOWED_KEYS = [
  // Plesk
  "PLESK_API_URL", "PLESK_API_LOGIN", "PLESK_API_PASSWORD",
  // SMTP
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE",
  "SMTP_USER", "SMTP_PASSWORD",
  "SMTP_FROM_EMAIL", "SMTP_FROM_NAME",
  // IMAP
  "IMAP_HOST", "IMAP_PORT", "IMAP_TLS",
  "IMAP_USER", "IMAP_PASSWORD",
  // DigiCert
  "DIGICERT_API_KEY", "DIGICERT_ORG_ID",
  // Google Play
  "GOOGLE_PLAY_SERVICE_ACCOUNT_KEY",
  // Apple Connect
  "APPLE_CONNECT_KEY_ID", "APPLE_CONNECT_ISSUER_ID", "APPLE_CONNECT_PRIVATE_KEY",
];

const SENSITIVE_KEYS = new Set([
  "PLESK_API_PASSWORD",
  "SMTP_PASSWORD",
  "IMAP_PASSWORD",
  "DIGICERT_API_KEY",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_KEY",
  "APPLE_CONNECT_PRIVATE_KEY",
]);

// GET /api/settings?keys=PLESK_API_URL,PLESK_API_LOGIN,...
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keysParam = req.nextUrl.searchParams.get("keys");
  const keys = keysParam
    ? keysParam.split(",").filter((k) => ALLOWED_KEYS.includes(k))
    : ALLOWED_KEYS;

  const settings = await getSettings(keys);

  // Mask sensitive values — only show if set or not
  const result: Record<string, string> = {};
  for (const key of keys) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = settings[key] ? "••••••••" : "";
    } else {
      result[key] = settings[key] || "";
    }
  }

  return NextResponse.json(result);
}

// PUT /api/settings — update settings
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, string> = {};

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (typeof value !== "string") continue;
    // Skip masked placeholders for sensitive fields
    if (SENSITIVE_KEYS.has(key) && value === "••••••••") continue;
    if (value === "") continue; // Don't store empty strings
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid settings to update" }, { status: 400 });
  }

  await setSettings(updates);

  logAudit({
    action: "UPDATE",
    entity: "SYSTEM_SETTINGS",
    description: `Updated settings: ${Object.keys(updates).join(", ")}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { keys: Object.keys(updates) },
  });

  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}
