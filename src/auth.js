import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ghCommand, git, githubSlug, remoteUrl, repoRoot, run } from './git.js';
import { SKIP_DIRS } from './rules.js';

/** A GitHub token from the environment or from a logged-in GitHub CLI. Returns null when there is none. */
export function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const gh = ghCommand();
  if (gh) {
    try { return run(gh, ['auth', 'token']) || null; } catch { /* installed, but not logged in */ }
  }
  return null;
}

/** `12345+alice@users.noreply.github.com` or `alice@users.noreply.github.com` gives `alice`. */
export function loginFromEmail(email) {
  const m = /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec((email || '').trim());
  return m ? m[1] : null;
}

/** The GitHub owners of the repos in a folder, most common first. Looks at the folder itself and the projects directly inside it. */
export function ownersFromRemotes(dir) {
  const counts = new Map();
  const count = (root) => {
    const slug = githubSlug(remoteUrl(root));
    if (slug) counts.set(slug.split('/')[0], (counts.get(slug.split('/')[0]) || 0) + 1);
  };
  const top = repoRoot(dir);
  if (top) count(top);
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { /* unreadable folder */ }
  for (const e of entries.slice(0, 300)) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const child = path.join(dir, e.name);
    if (existsSync(path.join(child, '.git'))) count(child);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([owner]) => owner);
}

/**
 * Best guesses for who the person at this computer is on GitHub, best first.
 * Reads only the git settings and repo links that are already on disk. Never a password or a token.
 */
export function guessUsernames(dir = process.cwd()) {
  const fromConfig = git(dir, ['config', '--global', 'github.user'], { allowFail: true });
  const fromEmail = loginFromEmail(git(dir, ['config', '--global', 'user.email'], { allowFail: true }));
  return [...new Set([fromConfig, fromEmail, ...ownersFromRemotes(dir)].filter(Boolean))];
}

/** Plain steps for getting logged in, written for the computer the person is on. */
export function loginHelp(platform = process.platform) {
  const install = platform === 'darwin'
    ? ['    brew install gh', '    (no Homebrew? download it from https://cli.github.com)']
    : platform === 'win32'
      ? ['    winget install --id GitHub.cli', '    (or download it from https://cli.github.com)']
      : ['    see https://github.com/cli/cli#installation for your system'];
  const setVar = platform === 'win32' ? '    $env:GITHUB_TOKEN = "paste-your-token-here"' : '    export GITHUB_TOKEN=paste-your-token-here';
  return [
    '  Easiest way, the GitHub CLI:',
    '    1. Install it:',
    ...install.map((l) => `  ${l}`),
    '    2. Log in. It opens your browser, you click Authorize, done:',
    '      gh auth login',
    '    3. Run this command again.',
    '',
    '  Or use a token instead:',
    '    1. Go to https://github.com/settings/personal-access-tokens/new',
    '    2. Pick the repos you want checked. Under Permissions set:',
    '         Contents: Read and write   (Read only is enough just to check)',
    '         Pull requests: Read and write',
    '    3. Put the token in your terminal (not in a chat or a file):',
    `  ${setVar}`,
  ].join('\n');
}
