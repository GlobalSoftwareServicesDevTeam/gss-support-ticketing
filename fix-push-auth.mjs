/**
 * Fix push auth for repos that failed:
 *  1. gsssupportticketing  - update remote URL to use PAT token, then push
 *  2. gss-website          - create GitHub repo (if needed), set remote, push
 *
 * Usage: node fix-push-auth.mjs
 */

import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { readFileSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { spawnSync } from 'child_process';

// ─── Load .env ────────────────────────────────────────────────────────────────
const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const clean = line.replace(/\r$/, '');
  const m = clean.match(/^([^#=]+)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[m[1].trim()] = val;
  }
}
process.env.VAULT_ENCRYPTION_KEY = env.VAULT_ENCRYPTION_KEY || '';
process.env.AUTH_SECRET           = env.AUTH_SECRET           || '';

// ─── Decrypt ──────────────────────────────────────────────────────────────────
function getKey() {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error('Missing VAULT_ENCRYPTION_KEY');
  return scryptSync(secret, 'gss-vault-salt', 32);
}
function decrypt(b64) {
  const key    = getKey();
  const packed  = Buffer.from(b64, 'base64');
  const iv      = packed.subarray(16, 32);
  const authTag = packed.subarray(32, 48);
  const cipher  = packed.subarray(48);
  const dec     = createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(authTag);
  return Buffer.concat([dec.update(cipher), dec.final()]).toString('utf8');
}

// ─── Git helpers ──────────────────────────────────────────────────────────────
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  return { ok: r.status === 0, stdout: (r.stdout||'').trim(), stderr: (r.stderr||'').trim() };
}

// ─── GitHub API ───────────────────────────────────────────────────────────────
async function ghFetch(path, token, opts = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
}

async function getGhUser(token) {
  const r = await ghFetch('/user', token);
  if (!r.ok) throw new Error(`GitHub /user ${r.status}`);
  return r.json();
}

async function repoExists(token, owner, name) {
  const r = await ghFetch(`/repos/${owner}/${name}`, token);
  return r.ok;
}

async function createRepo(token, owner, name, description, isOrg) {
  const url  = isOrg ? `/orgs/${owner}/repos` : '/user/repos';
  const r    = await ghFetch(url, token, { method: 'POST', body: JSON.stringify({ name, description, private: true, auto_init: false }) });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.message || '';
    const exists422 = r.status === 422 && (msg.includes('already exists') || (data?.errors||[]).some(e => e?.message?.includes('already taken')));
    if (exists422) return { alreadyExists: true };
    throw new Error(`GitHub ${r.status}: ${msg}`);
  }
  return { data };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });

async function main() {
  const accounts = await prisma.gitHubAccount.findMany({ orderBy: { createdAt: 'asc' } });
  if (!accounts.length) { console.error('No GitHub accounts in DB'); process.exit(1); }

  const account = accounts[0];
  const token   = decrypt(account.patEncrypted);
  const ghUser  = await getGhUser(token);
  const isOrg   = ghUser.login.toLowerCase() !== account.owner.toLowerCase();
  console.log(`Using GitHub account: ${account.owner} (${account.label})\n`);

  // ── 1. Fix gsssupportticketing remote + push ─────────────────────────────
  {
    const repoDir    = 'D:\\GlobalSoftwareServices\\New folder\\gsssupportticketing';
    const remoteUrl  = `https://x-access-token:${token}@github.com/GlobalWebServe/gss-support-ticketing.git`;
    console.log('=== gsssupportticketing ===');

    // Update remote URL to include token
    const setUrl = git(repoDir, 'remote', 'set-url', 'origin', remoteUrl);
    if (!setUrl.ok) { console.error('  ✗ set-url failed:', setUrl.stderr); }
    else console.log('  ✓ remote URL updated with PAT');

    // Push
    const push = git(repoDir, 'push');
    if (!push.ok) {
      // try --set-upstream if no tracking branch
      if (push.stderr.includes('no upstream') || push.stderr.includes('set-upstream')) {
        const branch = git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout || 'main';
        const push2 = git(repoDir, 'push', '--set-upstream', 'origin', branch);
        if (push2.ok) console.log('  ✓ pushed (with --set-upstream)');
        else console.error('  ✗ push failed:', push2.stderr);
      } else {
        console.error('  ✗ push failed:', push.stderr);
      }
    } else {
      console.log('  ✓ pushed');
    }
  }

  // ── 2. gss-website: create repo if needed, set remote, push ─────────────
  {
    const repoDir  = 'D:\\GlobalSoftwareServices\\New folder\\gss-website';
    const repoName = 'gss-website';
    const owner    = account.owner;
    console.log('\n=== gss-website ===');

    // Check/create GitHub repo
    const exists = await repoExists(token, owner, repoName);
    if (!exists) {
      console.log(`  Creating GitHub repo ${owner}/${repoName}...`);
      const created = await createRepo(token, owner, repoName, 'GSS Website', isOrg);
      if (created.alreadyExists) console.log('  Repo already exists on GitHub.');
      else console.log(`  ✓ Created ${owner}/${repoName}`);
    } else {
      console.log(`  Repo ${owner}/${repoName} already exists on GitHub.`);
    }

    // Set remote
    const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repoName}.git`;
    const hasRemote = git(repoDir, 'remote').stdout.includes('origin');
    const setRemote = hasRemote
      ? git(repoDir, 'remote', 'set-url', 'origin', remoteUrl)
      : git(repoDir, 'remote', 'add', 'origin', remoteUrl);
    if (!setRemote.ok) { console.error('  ✗ set remote failed:', setRemote.stderr); }
    else console.log('  ✓ remote set');

    // Make sure we're on main branch (rename master→main if needed)
    const branch = git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout || 'master';
    if (branch === 'master') {
      git(repoDir, 'branch', '-M', 'main');
      console.log('  ✓ renamed branch master → main');
    }

    // Push
    const currentBranch = git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout || 'main';
    const push = git(repoDir, 'push', '--set-upstream', 'origin', currentBranch);
    if (push.ok) console.log('  ✓ pushed');
    else console.error('  ✗ push failed:', push.stderr);
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
