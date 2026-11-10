import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scan } from './scan.js';
import { fix } from './fix.js';
import { c, printChanges } from './report.js';
import {
  currentBranch, ghCommand, git, githubSlug, hasTrackedChanges, remoteUrl, repoRoot, run, trackedFiles,
} from './git.js';

const BRANCH = 'forkguard/remove-malware';

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const gh = ghCommand();
  if (gh) {
    try { return run(gh, ['auth', 'token']); } catch { /* not logged in */ }
  }
  return null;
}

async function api(route, { method = 'GET', body } = {}) {
  const t = token();
  const res = await fetch(`https://api.github.com${route}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'forkguard',
      ...(t ? { authorization: `Bearer ${t}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub said ${res.status}`);
  return data;
}

function freeBranchName(root) {
  let name = BRANCH;
  for (let i = 2; git(root, ['rev-parse', '--verify', '-q', `refs/heads/${name}`], { allowFail: true }); i++) name = `${BRANCH}-${i}`;
  return name;
}

function prBody(changes, findings) {
  const lines = changes.filter((x) => !x.failed).map((x) => `- \`${x.file}\`: ${x.action}`);
  const rewritten = findings.find((f) => f.rule === 'rewritten');
  return [
    'This repo had malware hidden in it, the kind that runs when someone opens the folder in VS Code or runs `npm install` / `npm run dev`. It steals tokens, keys and saved passwords, then uses them to spread to more repos.',
    '',
    'What this pull request removes:',
    '',
    ...lines,
    '',
    rewritten ? `The latest commit (${rewritten.message.split(' ')[1]}) was rewritten after it was made, which is how this malware hides. ` : '',
    'After merging, anyone who ran this project recently should:',
    '',
    '1. Rotate GitHub tokens, npm tokens, cloud keys and anything in `.env` files, from another device.',
    '2. Block force pushes on the default branch so the malware cannot rewrite history again.',
    '3. Run a full antivirus scan.',
    '',
    'Found and cleaned with [forkguard](https://github.com/PRODHOSH/forkguard).',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/**
 * Cleans the repo on a new branch, pushes it and opens a pull request.
 * Default target is your own repo (origin). With `upstream`, the branch is built from the
 * original repo you forked, so the pull request holds only the fix.
 */
export async function openPr(target, { upstream = false } = {}) {
  const root = repoRoot(target);
  if (!root) throw new Error('This folder is not a git repo, so there is nothing to open a pull request on.');
  const originSlug = githubSlug(remoteUrl(root));
  if (!originSlug) throw new Error('The origin remote is not on GitHub.');
  if (hasTrackedChanges(root)) throw new Error('You have uncommitted changes. Commit or stash them first so they do not end up in the fix.');

  const startBranch = currentBranch(root);
  let repo = originSlug;
  let base = startBranch;
  let startPoint = 'HEAD';

  if (upstream) {
    const info = await api(`/repos/${originSlug}`);
    if (!info.fork || !info.parent) throw new Error(`${originSlug} is not a fork, so there is no upstream. Run "forkguard pr" without --upstream.`);
    repo = info.parent.full_name;
    base = info.parent.default_branch;
    git(root, ['fetch', '-q', `https://github.com/${repo}.git`, `${base}:refs/forkguard/upstream`]);
    startPoint = 'refs/forkguard/upstream';
  }
  if (!base) throw new Error('You are not on a branch. Switch to the branch you want to clean first.');

  const branch = freeBranchName(root);
  git(root, ['switch', '-q', '-c', branch, startPoint]);
  let committed = false; // an abandoned branch is cleaned up in `finally`
  try {
    const result = scan(root);
    const fixable = result.findings.filter((f) => f.fix);
    if (!fixable.length) {
      console.log(`${c.green('forkguard')}  ${upstream ? repo : path.basename(root)} has nothing to clean.`);
      return null;
    }
    console.log(`${c.bold('forkguard')}  cleaning ${repo} on a new branch ${c.cyan(branch)}\n`);
    const changes = fix(result, { untrackSecrets: true });
    printChanges(changes);
    if (!changes.some((x) => !x.failed)) throw new Error('Nothing could be fixed automatically.');

    // .env files were already taken out of git with `git rm --cached`; adding them back would undo that.
    const toAdd = changes.filter((x) => !x.failed && !x.action.startsWith('removed from git')).map((x) => x.file.replace(/\/$/, ''));
    // Droppers are often untracked and ignored: they are gone from disk now and git has nothing to add for them.
    const tracked = trackedFiles(root);
    const addable = [...new Set(toAdd)].filter((f) => existsSync(path.join(root, f)) || tracked.some((t) => t === f || t.startsWith(`${f}/`)));
    if (addable.length) git(root, ['add', '-A', '--', ...addable]);
    if (git(root, ['diff', '--cached', '--quiet'], { allowFail: true }) !== null) {
      console.log(`\n  Only files that were never committed needed removing, so there is nothing to put in a pull request. They are already deleted from this folder.`);
      return null;
    }
    const msgFile = path.join(mkdtempSync(path.join(tmpdir(), 'forkguard-')), 'msg.txt');
    writeFileSync(msgFile, `Remove injected malware\n\n${changes.filter((x) => !x.failed).map((x) => `- ${x.file}: ${x.action}`).join('\n')}\n`);
    git(root, ['commit', '-q', '-F', msgFile]);
    committed = true;
    rmSync(path.dirname(msgFile), { recursive: true, force: true });

    console.log(`\n  Pushing ${branch} to ${originSlug}`);
    git(root, ['push', '-q', '-u', 'origin', branch]);

    const owner = originSlug.split('/')[0];
    const title = 'Remove injected malware';
    const body = prBody(changes, result.findings);
    let url = null;
    const gh = ghCommand();
    if (gh) {
      try {
        url = run(gh, ['pr', 'create', '--repo', repo, '--base', base, '--head', `${owner}:${branch}`, '--title', title, '--body', body]);
      } catch (err) {
        console.log(c.dim(`  gh could not open the pull request: ${String(err.stderr || err.message).trim().split('\n').pop()}`));
      }
    }
    if (!url && token()) {
      try {
        url = (await api(`/repos/${repo}/pulls`, { method: 'POST', body: { title, body, head: `${owner}:${branch}`, base } })).html_url;
      } catch (err) {
        console.log(c.dim(`  GitHub could not open the pull request: ${err.message}`));
      }
    }
    if (url) {
      console.log(`\n  ${c.green('Pull request opened:')} ${url}`);
    } else {
      console.log(`\n  Branch pushed. Open the pull request here:\n  https://github.com/${repo}/compare/${base}...${owner}:${branch}?expand=1`);
    }
    return url;
  } finally {
    if (!committed) git(root, ['reset', '-q', '--hard'], { allowFail: true }); // the tree was clean when we started
    git(root, ['switch', '-q', startBranch || '-'], { allowFail: true });
    if (!committed) git(root, ['branch', '-q', '-D', branch], { allowFail: true });
    if (upstream) git(root, ['update-ref', '-d', 'refs/forkguard/upstream'], { allowFail: true });
  }
}
