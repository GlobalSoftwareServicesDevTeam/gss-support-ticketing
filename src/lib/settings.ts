import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

// Keys that contain secrets and should be encrypted
const SENSITIVE_KEYS = new Set([
  "PLESK_API_PASSWORD",
  "SMTP_PASSWORD",
  "IMAP_PASSWORD",
  "DIGICERT_API_KEY",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_KEY",
  "APPLE_CONNECT_PRIVATE_KEY",
  "SENTRY_WEBHOOK_SECRET",
  "IIS_API_KEY",
  "MS_GRAPH_CLIENT_SECRET",
  "INVOICE_NINJA_TOKEN",
]);

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) {
    // Fallback to environment variable
    return process.env[key] || null;
  }
  if (row.encrypted) {
    try {
      return decrypt(row.value);
    } catch {
      return null;
    }
  }
  return row.value;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });

  const result: Record<string, string> = {};
  const foundKeys = new Set<string>();

  for (const row of rows) {
    if (row.encrypted) {
      try {
        result[row.key] = decrypt(row.value);
        foundKeys.add(row.key);
      } catch {
        // decryption failed — do NOT add to foundKeys so env fallback can apply
      }
    } else {
      result[row.key] = row.value;
      foundKeys.add(row.key);
    }
  }

  // Fallback to env for missing or corrupted keys
  for (const key of keys) {
    if (!foundKeys.has(key) && process.env[key]) {
      result[key] = process.env[key]!;
    }
  }

  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const shouldEncrypt = SENSITIVE_KEYS.has(key) || key.endsWith("_SENTRY_SECRET");
  const storedValue = shouldEncrypt ? encrypt(value) : value;

  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: storedValue, encrypted: shouldEncrypt },
    create: { key, value: storedValue, encrypted: shouldEncrypt },
  });
}

export async function setSettings(settings: Record<string, string>): Promise<void> {
  const ops = Object.entries(settings).map(([key, value]) => {
    const shouldEncrypt = SENSITIVE_KEYS.has(key) || key.endsWith("_SENTRY_SECRET");
    const storedValue = shouldEncrypt ? encrypt(value) : value;
    return prisma.systemSetting.upsert({
      where: { key },
      update: { value: storedValue, encrypted: shouldEncrypt },
      create: { key, value: storedValue, encrypted: shouldEncrypt },
    });
  });
  await prisma.$transaction(ops);
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key } });
}

// Group getters for specific config sections
export async function getPleskConfig() {
  return getSettings(["PLESK_API_URL", "PLESK_API_LOGIN", "PLESK_API_PASSWORD"]);
}

export async function getSmtpConfig() {
  return getSettings([
    "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE",
    "SMTP_USER", "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL", "SMTP_FROM_NAME",
  ]);
}

export async function getImapConfig() {
  return getSettings([
    "IMAP_HOST", "IMAP_PORT", "IMAP_TLS",
    "IMAP_USER", "IMAP_PASSWORD", "IMAP_AUTH_METHOD",
  ]);
}

export async function getDigicertConfig() {
  return getSettings(["DIGICERT_API_KEY", "DIGICERT_ORG_ID"]);
}

export async function getGooglePlayConfig() {
  return getSettings(["GOOGLE_PLAY_SERVICE_ACCOUNT_KEY"]);
}

export async function getAppleConnectConfig() {
  return getSettings([
    "APPLE_CONNECT_KEY_ID",
    "APPLE_CONNECT_ISSUER_ID",
    "APPLE_CONNECT_PRIVATE_KEY",
  ]);
}

export async function getIisServerConfig() {
  return getSettings(["IIS_API_URL", "IIS_API_KEY", "IIS_SERVER_NAME"]);
}

export async function getMicrosoftGraphConfig() {
  return getSettings([
    "MS_GRAPH_TENANT_ID",
    "MS_GRAPH_CLIENT_ID",
    "MS_GRAPH_CLIENT_SECRET",
    "MS_GRAPH_MAILBOX_USER",
  ]);
}
