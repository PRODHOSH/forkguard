import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Repo hooks never run while forkguard works: an infected repo can ship its own hooks.
const NO_HOOKS = ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`];
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

export function git(cwd, args, { input, allowFail = false, raw = false } = {}) {
  const res = spawnSync('git', [...NO_HOOKS, ...args], { cwd, input, env: ENV, maxBuffer: 256 * 1024 * 1024 });
  if (res.error) {
    if (allowFail) return null;
    throw new Error('git is not installed or not on PATH');
  }
  if (res.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args[0]} failed: ${res.stderr.toString().trim().split('\n').pop()}`);
  }
  return raw ? res.stdout : res.stdout.toString().trim();
}

/**
 * The real, fully resolved path. Temp folders often have two names (/var and /private/var on macOS,
 * RUNNER~1 and runneradmin on Windows), and paths only compare correctly once both are resolved.
 */
export function realPath(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export function repoRoot(dir) {
  const top = git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true });
  return top ? realPath(top) : null;
}

/** Whether git ignores this path. */
export function isIgnored(root, rel) {
  return git(root, ['check-ignore', '-q', '--', rel], { allowFail: true }) !== null;
}

export function isGitRepo(dir) {
  return Boolean(repoRoot(dir));
}

export function trackedFiles(root) {
  const out = git(root, ['ls-files', '-z'], { allowFail: true });
  return out ? out.split('\0').filter(Boolean) : [];
}

/** Newer versions of a file first, as commit ids. */
export function fileHistory(root, rel, limit = 40) {
  const out = git(root, ['log', '--format=%H', '-n', String(limit), 'HEAD', '--', rel], { allowFail: true });
  return out ? out.split('\n').filter(Boolean) : [];
}

export function showFile(root, commit, rel) {
  return git(root, ['show', `${commit}:${rel}`], { allowFail: true, raw: true });
}

/**
 * The malware rewrites your latest commit and keeps your name, time and message. The only tell is
 * that the commit time is the exact same moment written in a different timezone.
 */
export function rewrittenHead(root) {
  const out = git(root, ['log', '-1', '--format=%at|%ai|%ct|%ci|%cn|%h|%s'], { allowFail: true });
  if (!out) return null;
  const [at, ai, ct, ci, cn, hash, subject] = out.split('|');
  const tzA = ai.split(' ').pop();
  const tzC = ci.split(' ').pop();
  if (at === ct && tzA !== tzC && cn !== 'GitHub') return { hash, subject, authorTz: tzA, committerTz: tzC };
  return null;
}

export function currentBranch(root) {
  return git(root, ['branch', '--show-current'], { allowFail: true }) || '';
}

export function hasTrackedChanges(root) {
  return Boolean(git(root, ['status', '--porcelain', '--untracked-files=no'], { allowFail: true }));
}

export function remoteUrl(root, name = 'origin') {
  return git(root, ['remote', 'get-url', name], { allowFail: true });
}

export function githubSlug(url) {
  if (!url) return null;
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function hasCommand(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
}

export function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

export { existsSync };
