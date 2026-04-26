/**
 * One-off script: for every git repo under D:\GlobalSoftwareServices
 *   1. git add -A  (stage all changes)
 *   2. git commit -m "<message>"  (only if there are staged changes)
 *   3. git push  (push to origin)
 *   4. Register the repo in GitHub Desktop via the github-windows:// URL scheme
 *
 * Usage:
 *   node commit-push-all-repos.mjs
 *   node commit-push-all-repos.mjs --dry-run
 *   node commit-push-all-repos.mjs --message="feat: sync local changes"
 *   node commit-push-all-repos.mjs --base=D:\SomeOtherFolder
 *   node commit-push-all-repos.mjs --skip-desktop   (skip GitHub Desktop registration)
 */

import { readdirSync, existsSync, statSync } from 'fs';
import { spawnSync, execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Args ─────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const SKIP_DESK   = args.includes('--skip-desktop');
const baseArg     = args.find(a => a.startsWith('--base='))?.split('=').slice(1).join('=') ?? null;
const msgArg      = args.find(a => a.startsWith('--message='))?.split('=').slice(1).join('=') ?? null;
const BASE_DIR    = baseArg ?? 'D:\\GlobalSoftwareServices';
const COMMIT_MSG  = msgArg  ?? 'chore: commit local changes';

if (DRY_RUN) console.log('[DRY RUN] No git operations will be performed.\n');
console.log(`Scanning: ${BASE_DIR}`);
console.log(`Commit message: "${COMMIT_MSG}"\n`);

// ─── Recursively find all .git directories (max depth 5) ─────────────────────
function findGitRepos(dir, depth = 0) {
  if (depth > 5) return [];
  const repos = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === '.git') {
      repos.push(dir); // the repo root is the parent of .git
      return repos;    // don't recurse inside .git
    }
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    repos.push(...findGitRepos(full, depth + 1));
  }
  return repos;
}

// ─── Git helpers (synchronous) ────────────────────────────────────────────────
function git(cwd, ...gitArgs) {
  const result = spawnSync('git', gitArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return {
    ok:     result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    code:   result.status ?? 1,
  };
}

function hasUncommittedChanges(repoDir) {
  const r = git(repoDir, 'status', '--porcelain');
  return r.ok && r.stdout.length > 0;
}

function hasUnpushedCommits(repoDir) {
  // Check if current branch is ahead of its remote tracking branch
  const r = git(repoDir, 'rev-list', '--count', '@{u}..HEAD');
  if (!r.ok || r.stdout === '') return false;
  return parseInt(r.stdout, 10) > 0;
}

// ─── GitHub Desktop registration via URL scheme ───────────────────────────────
function addToGithubDesktop(repoDir) {
  // GitHub Desktop on Windows supports:
  // github-windows://openRepo/<path>
  const encoded = encodeURIComponent(repoDir);
  const url = `github-windows://openRepo/${encoded}`;
  try {
    // Use cmd /c start to invoke the URL protocol handler without blocking
    spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore', shell: false });
    return true;
  } catch {
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const repos = findGitRepos(BASE_DIR);
console.log(`Found ${repos.length} git repos.\n`);

const stats = { committed: 0, pushed: 0, upToDate: 0, failed: 0, desktopAdded: 0 };

for (const repoDir of repos) {
  const label = repoDir.replace(BASE_DIR + path.sep, '');
  let hasChanges = false;

  // ── 1. Stage all changes ───────────────────────────────────────────────────
  if (hasUncommittedChanges(repoDir)) {
    hasChanges = true;
    console.log(`  COMMIT  ${label}`);
    if (!DRY_RUN) {
      const addResult = git(repoDir, 'add', '-A');
      if (!addResult.ok) {
        console.error(`          ✗ git add failed: ${addResult.stderr}`);
        stats.failed++;
        continue;
      }
      const commitResult = git(repoDir, 'commit', '-m', COMMIT_MSG);
      if (!commitResult.ok) {
        console.error(`          ✗ git commit failed: ${commitResult.stderr}`);
        stats.failed++;
        continue;
      }
      console.log(`          ✓ committed`);
      stats.committed++;
    } else {
      stats.committed++;
    }
  }

  // ── 2. Push ────────────────────────────────────────────────────────────────
  const needsPush = hasChanges || hasUnpushedCommits(repoDir);
  if (needsPush) {
    if (!hasChanges) console.log(`  PUSH    ${label}`);
    if (!DRY_RUN) {
      const pushResult = git(repoDir, 'push');
      if (!pushResult.ok) {
        // Try push with --set-upstream if no remote tracking branch
        if (pushResult.stderr.includes('no upstream')) {
          const branchResult = git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD');
          const branch = branchResult.stdout || 'main';
          const pushUp = git(repoDir, 'push', '--set-upstream', 'origin', branch);
          if (!pushUp.ok) {
            console.error(`          ✗ push failed: ${pushUp.stderr}`);
            stats.failed++;
            continue;
          }
        } else {
          console.error(`          ✗ push failed: ${pushResult.stderr}`);
          stats.failed++;
          continue;
        }
      }
      console.log(`          ✓ pushed`);
      stats.pushed++;
    } else {
      stats.pushed++;
    }
  } else {
    console.log(`  OK      ${label}  (nothing to commit or push)`);
    stats.upToDate++;
  }

  // ── 3. Register in GitHub Desktop ─────────────────────────────────────────
  if (!SKIP_DESK && !DRY_RUN) {
    const added = addToGithubDesktop(repoDir);
    if (added) stats.desktopAdded++;
  }
}

console.log('\n─────────────────────────────────────────');
console.log(`  Committed:       ${stats.committed}`);
console.log(`  Pushed:          ${stats.pushed}`);
console.log(`  Already up to date: ${stats.upToDate}`);
console.log(`  Failed:          ${stats.failed}`);
if (!SKIP_DESK && !DRY_RUN) console.log(`  Added to GitHub Desktop: ${stats.desktopAdded}`);
console.log('─────────────────────────────────────────');
