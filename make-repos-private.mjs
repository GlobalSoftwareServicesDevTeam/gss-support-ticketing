/**
 * One-off script: make all public GitHub repos (tracked in DB) private.
 * Usage:
 *   node make-repos-private.mjs
 *   node make-repos-private.mjs --dry-run
 */

import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { readFileSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';

// ─── Load .env ────────────────────────────────────────────────────────────────
const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const cleanLine = line.replace(/\r$/, '');
  const match = cleanLine.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[match[1].trim()] = val;
  }
}
process.env.VAULT_ENCRYPTION_KEY = env.VAULT_ENCRYPTION_KEY || '';
process.env.AUTH_SECRET = env.AUTH_SECRET || '';

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('[DRY RUN] No changes will be made.\n');

// ─── Decrypt ──────────────────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16, AUTH_TAG_LENGTH = 16, SALT_LENGTH = 16;

function getKey() {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error('VAULT_ENCRYPTION_KEY or AUTH_SECRET must be set');
  return scryptSync(secret, 'gss-vault-salt', 32);
}

function decrypt(encryptedBase64) {
  const key = getKey();
  const packed = Buffer.from(encryptedBase64, 'base64');
  const iv = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });

async function main() {
  // Load all public repos with their account token
  const repos = await prisma.gitHubRepo.findMany({
    where: { isPrivate: false },
    include: { account: { select: { patEncrypted: true, owner: true } } },
  });

  console.log(`Found ${repos.length} public repo(s) to make private.\n`);
  if (repos.length === 0) { console.log('Nothing to do.'); return; }

  // Group by account to avoid redundant decryption
  const tokenCache = {};
  let updated = 0, failed = 0;

  for (const repo of repos) {
    if (!repo.account) {
      console.warn(`  SKIP  ${repo.fullName}  →  no linked GitHub account`);
      continue;
    }

    const accountId = repo.accountId;
    if (!tokenCache[accountId]) {
      tokenCache[accountId] = decrypt(repo.account.patEncrypted);
    }
    const token = tokenCache[accountId];

    console.log(`  ${DRY_RUN ? '[DRY]' : 'PATCH'} ${repo.fullName}`);
    if (DRY_RUN) { updated++; continue; }

    try {
      const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ private: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`GitHub ${res.status}: ${data.message || 'unknown error'}`);
      }

      await prisma.gitHubRepo.update({ where: { id: repo.id }, data: { isPrivate: true } });
      console.log(`         → private`);
      updated++;
    } catch (err) {
      console.error(`  FAIL  ${repo.fullName}  →  ${err.message}`);
      failed++;
    }

    // Small delay to respect GitHub rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`${DRY_RUN ? 'Would update' : 'Updated'}:  ${updated}`);
  if (failed > 0) console.log(`Failed:     ${failed}`);
  console.log(`─────────────────────────────────────────`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
