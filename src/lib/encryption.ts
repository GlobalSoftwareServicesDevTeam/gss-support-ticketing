import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("VAULT_ENCRYPTION_KEY or AUTH_SECRET must be set");
  }
  // Derive a consistent 32-byte key from the secret using scrypt
  return scryptSync(secret, "gss-vault-salt", 32);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string of: salt + iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: salt(16) + iv(16) + tag(16) + ciphertext
  const packed = Buffer.concat([salt, iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext (from encrypt()).
 * Returns the original plaintext string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const packed = Buffer.from(encryptedBase64, "base64");

  const salt = packed.subarray(0, SALT_LENGTH);
  const iv = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  // salt is stored for future key-derivation upgrades
  void salt;

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
