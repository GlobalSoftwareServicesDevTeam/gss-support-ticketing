/**
 * Quick helper: push gss-website using PAT from DB
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

const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });

async function main() {
  const acc = (await prisma.gitHubAccount.findMany({ orderBy: { createdAt: 'asc' } }))[0];
  const token = decrypt(acc.patEncrypted);
  const repoDir = 'D:\\GlobalSoftwareServices\\New folder\\gss-website';
  const remoteUrl = `https://x-access-token:${token}@github.com/${acc.owner}/gss-website.git`;

  git(repoDir, 'remote', 'set-url', 'origin', remoteUrl);
  console.log('Remote URL set with PAT. Pushing...');

  const push = git(repoDir, 'push', '--set-upstream', 'origin', 'main');
  if (push.ok) console.log('✓ gss-website pushed successfully');
  else console.error('✗ Push failed:', push.stderr);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
