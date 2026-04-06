import { TOTP, Secret } from "otpauth";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "fallback-key-change-me";

// Derive a stable 32-byte key from the secret
function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

// Encrypt a string value
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

// Decrypt an encrypted string
function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Generate a new TOTP secret for a user
export function generateTotpSecret(email: string): { secret: string; encryptedSecret: string; otpauthUrl: string } {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "GSS Support",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    encryptedSecret: encrypt(secret.base32),
    otpauthUrl: totp.toString(),
  };
}

// Verify a TOTP token against an encrypted secret
export function verifyTotpToken(encryptedSecret: string, token: string): boolean {
  const secretBase32 = decrypt(encryptedSecret);
  const totp = new TOTP({
    issuer: "GSS Support",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });

  // Allow 1 period window (30s before/after)
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

// Generate backup codes (8 codes, 8 chars each)
export function generateBackupCodes(): { codes: string[]; hashedCodes: string[] } {
  const codes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
    hashedCodes.push(hashBackupCode(code));
  }

  return { codes, hashedCodes };
}

function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
}

// Verify a backup code against stored hashed codes, returns the remaining codes if valid
export function verifyBackupCode(
  encryptedCodes: string,
  inputCode: string
): { valid: boolean; remainingEncrypted: string | null } {
  const codesJson = decrypt(encryptedCodes);
  const hashedCodes: string[] = JSON.parse(codesJson);
  const inputHash = hashBackupCode(inputCode);

  const index = hashedCodes.indexOf(inputHash);
  if (index === -1) {
    return { valid: false, remainingEncrypted: null };
  }

  // Remove used code
  hashedCodes.splice(index, 1);
  const remainingEncrypted = encrypt(JSON.stringify(hashedCodes));
  return { valid: true, remainingEncrypted };
}

// Encrypt backup codes for storage
export function encryptBackupCodes(hashedCodes: string[]): string {
  return encrypt(JSON.stringify(hashedCodes));
}
