import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

// Keys that contain secrets and should be encrypted
const SENSITIVE_KEYS = new Set([
  "PLESK_API_PASSWORD",
  "SMTP_PASSWORD",
  "IMAP_PASSWORD",
  "DIGICERT_API_KEY",
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
    foundKeys.add(row.key);
    if (row.encrypted) {
      try {
        result[row.key] = decrypt(row.value);
      } catch {
        // skip corrupted
      }
    } else {
      result[row.key] = row.value;
    }
  }

  // Fallback to env for missing keys
  for (const key of keys) {
    if (!foundKeys.has(key) && process.env[key]) {
      result[key] = process.env[key]!;
    }
  }

  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const shouldEncrypt = SENSITIVE_KEYS.has(key);
  const storedValue = shouldEncrypt ? encrypt(value) : value;

  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: storedValue, encrypted: shouldEncrypt },
    create: { key, value: storedValue, encrypted: shouldEncrypt },
  });
}

export async function setSettings(settings: Record<string, string>): Promise<void> {
  const ops = Object.entries(settings).map(([key, value]) => {
    const shouldEncrypt = SENSITIVE_KEYS.has(key);
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
    "IMAP_USER", "IMAP_PASSWORD",
  ]);
}

export async function getDigicertConfig() {
  return getSettings(["DIGICERT_API_KEY", "DIGICERT_ORG_ID"]);
}
