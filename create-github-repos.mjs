/**
 * One-off script: create GitHub repos for all existing projects/subprojects
 * that don't already have a repo linked, using the naming convention:
 *   slugify(client)-slugify(project)-slugify(subproject)
 *
 * Usage:
 *   node create-github-repos.mjs
 *   node create-github-repos.mjs --dry-run
 *   node create-github-repos.mjs --account=my-org-name
 *   node create-github-repos.mjs --private
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1].trim()] = val;
  }
}
process.env.VAULT_ENCRYPTION_KEY = env.VAULT_ENCRYPTION_KEY || '';
process.env.AUTH_SECRET = env.AUTH_SECRET || '';

// ─── Parse args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MAKE_PRIVATE = args.includes('--private');
const accountArg = args.find(a => a.startsWith('--account='))?.split('=')[1] || null;

if (DRY_RUN) console.log('[DRY RUN] No repos will be created or saved to DB.\n');

// ─── Decrypt helper (mirrors src/lib/encryption.ts) ──────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getKey() {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error('VAULT_ENCRYPTION_KEY or AUTH_SECRET must be set in .env');
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

// ─── Slugify (mirrors UI logic) ───────────────────────────────────────────────
function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100); // GitHub repo names capped at 100 chars
}

function buildRepoName(clientName, projectName, subProjectName) {
  const parts = [slugify(clientName), slugify(projectName), slugify(subProjectName)].filter(Boolean);
  return parts.join('-').slice(0, 100);
}

// ─── GitHub API ───────────────────────────────────────────────────────────────
const GITHUB_API = 'https://api.github.com';

async function githubFetch(path, token, options = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

async function getGhUser(token) {
  const res = await githubFetch('/user', token);
  if (!res.ok) throw new Error(`GitHub /user returned ${res.status}`);
  return res.json();
}

async function createRepo(token, owner, name, description, isPrivate, isOrg) {
  const url = isOrg ? `/orgs/${owner}/repos` : '/user/repos';
  const res = await githubFetch(url, token, {
    method: 'POST',
    body: JSON.stringify({ name, description: description || undefined, private: isPrivate, auto_init: true }),
  });
  const data = await res.json();
  if (!res.ok) {
    // 422 with "already exists" is not really an error — repo exists on GitHub
    const msg = data?.message || '';
    const alreadyExists = res.status === 422 && (msg.includes('already exists') || (data?.errors || []).some(e => e?.message?.includes('already taken')));
    if (alreadyExists) return { alreadyExists: true };
    throw new Error(`GitHub API ${res.status}: ${msg}`);
  }
  return { repo: data };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: [],
});

async function main() {
  // 1. Load GitHub accounts
  const accounts = await prisma.gitHubAccount.findMany({ orderBy: { createdAt: 'asc' } });
  if (accounts.length === 0) {
    console.error('No GitHub accounts configured in the database. Add one first via Settings > GitHub Accounts.');
    process.exit(1);
  }

  let account = accounts[0];
  if (accountArg) {
    const found = accounts.find(a => a.owner.toLowerCase() === accountArg.toLowerCase());
    if (!found) {
      console.error(`GitHub account "${accountArg}" not found. Available: ${accounts.map(a => a.owner).join(', ')}`);
      process.exit(1);
    }
    account = found;
  }

  console.log(`Using GitHub account: ${account.owner} (${account.label})`);

  const token = decrypt(account.patEncrypted);
  const ghUser = await getGhUser(token);
  const isOrg = ghUser.login.toLowerCase() !== account.owner.toLowerCase();
  console.log(`Account type: ${isOrg ? 'Organization' : 'Personal'}`);
  console.log(`Repo visibility: ${MAKE_PRIVATE ? 'Private' : 'Public (use --private to override)'}\n`);

  // 2. Load all projects with subprojects, customer, and existing repos
  const projects = await prisma.project.findMany({
    where: { status: { not: 'DELETED' } },
    include: {
      customer: { select: { id: true, company: true } },
      subProjects: {
        include: { repos: { select: { id: true, owner: true, name: true } } },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { dateCreated: 'asc' },
  });

  console.log(`Found ${projects.length} projects with ${projects.reduce((s, p) => s + p.subProjects.length, 0)} subprojects.\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyOnGithub = 0;

  for (const project of projects) {
    const clientName = project.customer?.company || 'gss';
    const projectSlug = slugify(project.projectName);

    for (const sub of project.subProjects) {
      if (sub.repos.length > 0) {
        console.log(`  SKIP  ${project.projectName} / ${sub.name}  →  already has ${sub.repos.length} repo(s) linked`);
        skipped++;
        continue;
      }

      const repoName = buildRepoName(clientName, project.projectName, sub.name);

      if (!repoName || !/^[a-zA-Z0-9._-]+$/.test(repoName)) {
        console.warn(`  SKIP  ${project.projectName} / ${sub.name}  →  invalid repo name: "${repoName}"`);
        skipped++;
        continue;
      }

      const description = `${project.projectName} - ${sub.name}`;
      console.log(`  ${DRY_RUN ? '[DRY]' : 'CREATE'} ${account.owner}/${repoName}`);

      if (DRY_RUN) {
        created++;
        continue;
      }

      try {
        const result = await createRepo(token, account.owner, repoName, description, MAKE_PRIVATE, isOrg);

        let owner, name, fullName, htmlUrl, language, isPrivate;

        if (result.alreadyExists) {
          console.log(`         → already exists on GitHub, linking to DB`);
          alreadyOnGithub++;
          owner = account.owner;
          name = repoName;
          fullName = `${account.owner}/${repoName}`;
          htmlUrl = `https://github.com/${account.owner}/${repoName}`;
          language = null;
          isPrivate = MAKE_PRIVATE;
        } else {
          const ghRepo = result.repo;
          owner = ghRepo.owner.login;
          name = ghRepo.name;
          fullName = ghRepo.full_name;
          htmlUrl = ghRepo.html_url;
          language = ghRepo.language || null;
          isPrivate = ghRepo.private;
        }

        // Upsert into DB and link to project + subproject
        await prisma.gitHubRepo.upsert({
          where: { owner_name: { owner, name } },
          update: {
            description,
            htmlUrl,
            isPrivate,
            language,
            fullName,
            accountId: account.id,
            projectId: project.id,
            subProjectId: sub.id,
          },
          create: {
            owner,
            name,
            fullName,
            description,
            htmlUrl,
            isPrivate,
            language,
            accountId: account.id,
            projectId: project.id,
            subProjectId: sub.id,
          },
        });

        created++;
        console.log(`         → saved: ${htmlUrl}`);
      } catch (err) {
        console.error(`  FAIL  ${project.projectName} / ${sub.name}  →  ${err.message}`);
        failed++;
      }

      // Small delay to avoid GitHub rate limit (secondary rate limit: 100 req/min for mutations)
      await new Promise(r => setTimeout(r, 750));
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`${DRY_RUN ? 'Would create' : 'Created'}:     ${created}`);
  console.log(`Skipped:      ${skipped} (already had repos)`);
  if (!DRY_RUN && alreadyOnGithub > 0) console.log(`Existed on GH: ${alreadyOnGithub} (linked in DB)`);
  if (failed > 0) console.log(`Failed:       ${failed}`);
  console.log(`─────────────────────────────────────────`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
