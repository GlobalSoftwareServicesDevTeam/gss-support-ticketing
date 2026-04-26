/**
 * Fix the gsssupportticketing remote - old URL points to wrong account.
 * Creates the repo under GlobalSoftwareServicesDevTeam if needed, then pushes.
 */
import { PrismaClient } from './node_modules/.prisma/client/index.js';
import { readFileSync } from 'fs';
import { createDecipheriv, scryptSync } from 'crypto';
import { spawnSync } from 'child_process';

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
process.env.AUTH_SECRET = env.AUTH_SECRET || '';

function decrypt(b64) {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  const key = scryptSync(secret, 'gss-vault-salt', 32);
  const packed = Buffer.from(b64, 'base64');
  const iv = packed.subarray(16, 32);
  const authTag = packed.subarray(32, 48);
  const cipher = packed.subarray(48);
  const dec = createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(authTag);
  return Buffer.concat([dec.update(cipher), dec.final()]).toString('utf8');
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

async function ghFetch(path, token, opts = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });

async function main() {
  const accounts = await prisma.gitHubAccount.findMany({ orderBy: { createdAt: 'asc' } });
  const account = accounts[0];
  const token = decrypt(account.patEncrypted);
  const owner = account.owner; // GlobalSoftwareServicesDevTeam

  const repoDir  = 'D:\\GlobalSoftwareServices\\New folder\\gsssupportticketing';
  const repoName = 'gss-support-ticketing';

  console.log(`Using account: ${owner}`);

  // Check if repo exists on GitHub
  const check = await ghFetch(`/repos/${owner}/${repoName}`, token);
  if (!check.ok) {
    console.log(`Creating ${owner}/${repoName} on GitHub...`);
    const ghUser = await (await ghFetch('/user', token)).json();
    const isOrg = ghUser.login.toLowerCase() !== owner.toLowerCase();
    const url = isOrg ? `/orgs/${owner}/repos` : '/user/repos';
    const res = await ghFetch(url, token, {
      method: 'POST',
      body: JSON.stringify({ name: repoName, description: 'GSS Support Ticketing System', private: true, auto_init: false }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('Create failed:', data.message); process.exit(1); }
    console.log(`✓ Created ${owner}/${repoName}`);
  } else {
    console.log(`Repo ${owner}/${repoName} already exists.`);
  }

  // Update remote to correct URL with token
  const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repoName}.git`;
  const setUrl = git(repoDir, 'remote', 'set-url', 'origin', remoteUrl);
  if (setUrl.ok) console.log('✓ Remote URL updated');
  else { console.error('✗ set-url failed:', setUrl.stderr); process.exit(1); }

  // Ensure on main branch
  const branch = git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout || 'master';
  if (branch === 'master') {
    git(repoDir, 'branch', '-M', 'main');
    console.log('✓ Renamed branch to main');
  }

  const currentBranch = git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout || 'main';

  // Push (force-push initial push if remote has no history yet)
  console.log('Pushing...');
  let push = git(repoDir, 'push', '--set-upstream', 'origin', currentBranch);
  if (!push.ok) {
    // If remote is freshly created and empty but has no common ancestor (auto_init=false so shouldn't happen)
    if (push.stderr.includes('rejected') || push.stderr.includes('non-fast-forward')) {
      push = git(repoDir, 'push', '--force', '--set-upstream', 'origin', currentBranch);
    }
  }
  if (push.ok) console.log('✓ Pushed successfully');
  else console.error('✗ Push failed:', push.stderr);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
