/**
 * One-off script: clone all GitHub repos from DB into D:\GlobalSoftwareServices\
 * organised as:  D:\GlobalSoftwareServices\<Client>\<Project>\<Subtask>
 *
 * Repos linked to a subproject  → D:\GlobalSoftwareServices\<Client>\<Project>\<Subtask>
 * Repos linked only to a project → D:\GlobalSoftwareServices\<Client>\<Project>\_project-repo
 * Repos with no project link      → D:\GlobalSoftwareServices\_unlinked\<owner>-<name>
 *
 * Usage:
 *   node clone-all-repos.mjs
 *   node clone-all-repos.mjs --dry-run
 *   node clone-all-repos.mjs --pull          # git pull instead of skipping existing clones
 *   node clone-all-repos.mjs --base=D:\MyFolder
 */

import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { spawnSync } from 'child_process';
import path from 'path';

// ─── Load .env ────────────────────────────────────────────────────────────────
const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const clean = line.replace(/\r$/, '');
  const m = clean.match(/^([^#=]+)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1].trim()] = val;
  }
}
process.env.VAULT_ENCRYPTION_KEY = env.VAULT_ENCRYPTION_KEY || '';
process.env.AUTH_SECRET           = env.AUTH_SECRET           || '';

// ─── Args ─────────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PULL    = args.includes('--pull');
const baseArg = args.find(a => a.startsWith('--base='))?.split('=').slice(1).join('=') || null;
const BASE_DIR = baseArg ?? 'D:\\';

if (DRY_RUN) console.log('[DRY RUN] No git operations will be performed.\n');
console.log(`Base directory: ${BASE_DIR}\n`);

// ─── Decrypt helper ───────────────────────────────────────────────────────────
const ALGORITHM       = 'aes-256-gcm';
const IV_LENGTH       = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH     = 16;

function getKey() {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error('VAULT_ENCRYPTION_KEY or AUTH_SECRET must be set in .env');
  return scryptSync(secret, 'gss-vault-salt', 32);
}

function decrypt(encryptedBase64) {
  const key    = getKey();
  const packed  = Buffer.from(encryptedBase64, 'base64');
  const iv      = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const cipher  = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const dec     = createDecipheriv(ALGORITHM, key, iv);
  dec.setAuthTag(authTag);
  return Buffer.concat([dec.update(cipher), dec.final()]).toString('utf8');
}

// ─── Sanitize a name for use as a Windows folder name ─────────────────────────
function sanitizeFolder(name) {
  return (name || 'unknown')
    .replace(/[\\/:*?"<>|]/g, '-')   // replace Windows-reserved chars
    .replace(/\.+$/, '')             // no trailing dots
    .trim()
    .slice(0, 80) || 'unknown';
}

// ─── Git helpers ──────────────────────────────────────────────────────────────
function gitClone(cloneUrl, destDir) {
  // Ensure parent exists
  mkdirSync(path.dirname(destDir), { recursive: true });
  const result = spawnSync('git', ['clone', cloneUrl, destDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return result;
}

function gitPull(repoDir) {
  const result = spawnSync('git', ['-C', repoDir, 'pull', '--ff-only'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: [],
});

async function main() {
  // Load all repos with their account (for PAT) and linked project/subproject/customer
  const repos = await prisma.gitHubRepo.findMany({
    include: {
      account:    true,
      subProject: {
        include: {
          project: {
            include: { customer: { select: { id: true, company: true } } },
          },
        },
      },
      project: {
        include: { customer: { select: { id: true, company: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Also load all GitHub accounts so we can look up PATs by owner
  const accounts = await prisma.gitHubAccount.findMany();
  const accountByOwner = Object.fromEntries(accounts.map(a => [a.owner.toLowerCase(), a]));

  console.log(`Found ${repos.length} repos in DB.\n`);

  let cloned = 0, pulled = 0, skipped = 0, failed = 0;

  for (const repo of repos) {
    // ── Determine clone token ─────────────────────────────────────────────────
    let token = null;
    if (repo.account?.patEncrypted) {
      try { token = decrypt(repo.account.patEncrypted); } catch { /* ignore */ }
    }
    if (!token) {
      // Fall back to any account that matches the owner
      const acc = accountByOwner[repo.owner.toLowerCase()];
      if (acc?.patEncrypted) {
        try { token = decrypt(acc.patEncrypted); } catch { /* ignore */ }
      }
    }
    if (!token) {
      // Last resort: try all accounts (repo might be in a different owner's org)
      for (const acc of accounts) {
        try { token = decrypt(acc.patEncrypted); break; } catch { /* ignore */ }
      }
    }

    const cloneUrl = token
      ? `https://x-access-token:${token}@github.com/${repo.owner}/${repo.name}.git`
      : `https://github.com/${repo.owner}/${repo.name}.git`;

    // ── Determine target folder path ──────────────────────────────────────────
    let destDir;

    if (repo.subProject) {
      const clientName  = sanitizeFolder(repo.subProject.project?.customer?.company || 'gss');
      const projectName = sanitizeFolder(repo.subProject.project?.projectName       || 'unknown-project');
      const subName     = sanitizeFolder(repo.subProject.name);
      destDir = path.join(BASE_DIR, clientName, projectName, subName);
    } else if (repo.project) {
      const clientName  = sanitizeFolder(repo.project.customer?.company || 'gss');
      const projectName = sanitizeFolder(repo.project.projectName       || 'unknown-project');
      destDir = path.join(BASE_DIR, clientName, projectName, '_project-repo');
    } else {
      destDir = path.join(BASE_DIR, '_unlinked', `${repo.owner}-${repo.name}`);
    }

    // ── Clone or pull ─────────────────────────────────────────────────────────
    const alreadyExists = existsSync(path.join(destDir, '.git'));

    if (alreadyExists) {
      if (PULL) {
        console.log(`  PULL  ${repo.fullName}  →  ${destDir}`);
        if (!DRY_RUN) {
          const r = gitPull(destDir);
          if (r.status !== 0) {
            console.error(`        ✗ pull failed: ${(r.stderr || r.stdout || '').trim()}`);
            failed++;
          } else {
            console.log(`        ✓ ${(r.stdout || '').trim() || 'up to date'}`);
            pulled++;
          }
        } else {
          pulled++;
        }
      } else {
        console.log(`  SKIP  ${repo.fullName}  →  already cloned at ${destDir}`);
        skipped++;
      }
      continue;
    }

    console.log(`  CLONE ${repo.fullName}  →  ${destDir}`);
    if (DRY_RUN) { cloned++; continue; }

    try {
      mkdirSync(path.dirname(destDir), { recursive: true });
      const r = gitClone(cloneUrl, destDir);
      if (r.status !== 0) {
        const errMsg = (r.stderr || r.stdout || '').trim();
        console.error(`        ✗ clone failed: ${errMsg}`);
        failed++;
      } else {
        console.log(`        ✓ cloned`);
        cloned++;
      }
    } catch (err) {
      console.error(`        ✗ error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n─────────────────────────────────');
  console.log(`  Cloned:  ${cloned}`);
  if (PULL) console.log(`  Pulled:  ${pulled}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  console.log('─────────────────────────────────');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
