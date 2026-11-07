import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CODE_EXT, CONFIG_RE, SKIP_DIRS } from './rules.js';
import { finish, inspect, isEnvFile, isInteresting } from './scan.js';
import { ghCommand, git, run } from './git.js';
import { c, label } from './report.js';

const NO_HOOKS = ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`];
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

// Same fingerprints as the folder scan, as one git grep pattern so thousands of files are searched in one go.
const GREP = String.raw`(?:global\['(r|!|_V|m)'\]|_\$_1e42|rmcej%otb%|Cot%3t=shtP|api\.trongrid\.io|aptoslabs\.com|^.{0,400}?[ \t]{30,}\S.{1500})`;

/** A GitHub link, a git URL, or owner/repo. Returns a clone URL and a short name, or null for a local folder. */
export function parseRemote(arg) {
  if (!arg) return null;
  const gh = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(arg);
  if (gh) return { url: `https://github.com/${gh[1]}/${gh[2]}.git`, name: `${gh[1]}/${gh[2]}` };
  if (/^(https?|ssh|git):\/\//.test(arg) || /^git@[^:]+:/.test(arg)) {
    return { url: arg, name: arg.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/') };
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(arg) && !existsSync(arg)) return { url: `https://github.com/${arg}.git`, name: arg };
  return null;
}

function cloneAsync(url, dir) {
  return new Promise((resolve) => {
    // Latest commit of every branch, no files written out. --no-checkout is what keeps it safe.
    const p = spawn('git', [...NO_HOOKS, 'clone', '--quiet', '--no-checkout', '--depth', '1', '--no-single-branch', url, dir], { env: ENV });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => resolve('git is not installed or not on PATH'));
    p.on('close', (code) => resolve(code === 0 ? null : err.trim().split('\n').pop() || `git clone failed (${code})`));
  });
}

/** Reads many blobs from git's database in one go. Nothing is written to disk. */
function readBlobs(dir, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const res = spawnSync('git', [...NO_HOOKS, 'cat-file', '--batch'], { cwd: dir, input: shas.join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024, env: ENV });
  const buf = res.stdout;
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(10, i);
    if (nl === -1) break;
    const [sha, type, size] = buf.subarray(i, nl).toString().split(' ');
    if (type === 'missing' || !size) { i = nl + 1; continue; }
    const n = Number(size);
    out.set(sha, buf.subarray(nl + 1, nl + 1 + n));
    i = nl + 1 + n + 1;
  }
  return out;
}

function grepFiles(dir, ref, pattern, specs, fixed = false) {
  const res = spawnSync('git', [...NO_HOOKS, 'grep', '-l', fixed ? '-F' : '-P', '-e', pattern, ref, '--', ...specs], { cwd: dir, env: ENV, maxBuffer: 64 * 1024 * 1024 });
  if (res.status === 1) return new Set(); // no match
  if (res.status !== 0) return null; // this git cannot do it (no PCRE), fall back to reading files
  return new Set(res.stdout.toString().split('\n').filter(Boolean).map((l) => l.slice(ref.length + 1)));
}

const skipped = (p) => p.split('/').some((seg) => SKIP_DIRS.has(seg));

/** Runs every rule on one branch, straight from git's database. */
export function scanRef(dir, ref) {
  const findings = [];
  const add = (level, file, rule, message, fix = null) => findings.push({ level, file, rule, message, fix });
  const fontDirs = new Map();

  const entries = [];
  for (const rec of git(dir, ['ls-tree', '-r', '-z', ref], { raw: true }).toString().split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [, type, sha] = rec.slice(0, tab).split(' ');
    const rel = rec.slice(tab + 1);
    if (type !== 'blob' || skipped(rel)) continue;
    const name = path.posix.basename(rel);
    entries.push({ sha, rel, name, ext: path.posix.extname(name).toLowerCase() });
  }

  // Code files can number in the thousands, so let git find the suspicious ones first.
  const codeSpecs = [...CODE_EXT.map((e) => `*${e}`), 'init', '*/init'];
  const hits = grepFiles(dir, ref, GREP, codeSpecs);
  const prelude = grepFiles(dir, ref, 'exports: {}', codeSpecs, true);

  const want = entries.filter((f) => {
    if (isEnvFile(f.name)) return false;
    if (!isInteresting(f.name, f.ext)) return false;
    const isCode = CODE_EXT.includes(f.ext) || f.name === 'init';
    if (isCode) return hits === null || hits.has(f.rel) || (CONFIG_RE.test(f.rel) && prelude?.has(f.rel));
    if (f.name === 'README.md') return /fonts?$/i.test(path.posix.dirname(f.rel));
    return true;
  });
  const blobs = readBlobs(dir, [...new Set(want.map((f) => f.sha))]);
  for (const f of want) inspect(f, blobs.get(f.sha) ?? null, add, fontDirs);

  for (const f of entries) if (isEnvFile(f.name)) add('medium', f.rel, 'secret', 'Secret file is committed to the repo', 'untrack');

  if (findings.some((x) => x.level === 'high')) {
    const head = rewrittenHeadAt(dir, ref);
    if (head) add('medium', '(latest commit)', 'rewritten', `Commit ${head.hash} "${head.subject}" was rewritten: same time, different timezone (${head.authorTz} vs ${head.committerTz})`);
  }
  finish(findings, fontDirs, add);
  return { findings, checked: entries.length };
}

function rewrittenHeadAt(dir, ref) {
  const out = git(dir, ['log', '-1', '--format=%at|%ai|%ct|%ci|%cn|%h|%s', ref], { allowFail: true });
  if (!out) return null;
  const [at, ai, ct, ci, cn, hash, subject] = out.split('|');
  const tzA = ai.split(' ').pop();
  const tzC = ci.split(' ').pop();
  return at === ct && tzA !== tzC && cn !== 'GitHub' ? { hash, subject, authorTz: tzA, committerTz: tzC } : null;
}

/** Downloads a repo into a temporary folder, checks every branch, and deletes the download. */
export async function checkRemote(remote) {
  const dir = mkdtempSync(path.join(tmpdir(), 'forkguard-remote-'));
  try {
    const err = await cloneAsync(remote.url, path.join(dir, 'repo'));
    if (err) return { name: remote.name, url: remote.url, error: err };
    const repo = path.join(dir, 'repo');
    const refs = git(repo, ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/remotes/origin'])
      .split('\n').filter(Boolean).map((l) => l.split(' ')).filter(([r]) => r !== 'origin/HEAD' && r !== 'origin');
    const byCommit = new Map();
    const branches = [];
    for (const [ref, sha] of refs) {
      if (!byCommit.has(sha)) byCommit.set(sha, scanRef(repo, ref));
      branches.push({ name: ref.replace(/^origin\//, ''), ...byCommit.get(sha) });
    }
    return { name: remote.name, url: remote.url.replace(/\.git$/, ''), branches };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

export function printRemote(result) {
  if (result.error) {
    console.log(`${c.red('forkguard')}  could not download ${result.name}: ${result.error}`);
    return;
  }
  const bad = result.branches.filter((b) => b.findings.length);
  const count = `${result.branches.length} branch${result.branches.length === 1 ? '' : 'es'}`;
  if (!bad.length) {
    console.log(`${c.green('forkguard')}  ${result.name} looks clean ${c.dim(`(${count} checked)`)}`);
    return;
  }
  console.log(`${c.bold('forkguard')}  ${result.name} ${c.dim(`(${count} checked)`)}\n`);
  for (const b of result.branches) {
    if (!b.findings.length) {
      console.log(`  ${c.green('clean')}  ${b.name}`);
      continue;
    }
    console.log(`  ${c.bold(b.name)}`);
    const width = Math.min(40, Math.max(...b.findings.map((f) => f.file.length)) + 2);
    for (const f of b.findings) {
      const file = f.file.length < width ? f.file.padEnd(width) : `${f.file}\n${' '.repeat(12 + width)}`;
      console.log(`    ${label(f.level)}  ${file}${f.message}`);
    }
  }
  const high = bad.some((b) => b.findings.some((f) => f.level === 'high'));
  console.log('');
  if (high) {
    console.log(`  ${c.red('Do not clone and run this repo yet.')} If it is yours, clean it with:`);
    console.log(`    git clone ${result.url}`);
    console.log(`    cd ${result.name.split('/').pop()}`);
    console.log('    forkguard pr');
  } else {
    console.log(`  ${c.yellow('Nothing that runs on its own, but worth a look.')}`);
  }
}

async function listMine() {
  const gh = ghCommand();
  if (gh) {
    try {
      const out = run(gh, ['api', '--paginate', 'user/repos?affiliation=owner&per_page=100', '--jq', '.[] | [.full_name, .archived] | @tsv'], { maxBuffer: 16 * 1024 * 1024 });
      return out.split('\n').filter(Boolean).map((l) => { const [name, archived] = l.split('\t'); return { name, archived: archived === 'true' }; });
    } catch { /* fall through to token */ }
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Log in first so forkguard can list your repos: run "gh auth login", or set GITHUB_TOKEN.');
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'forkguard' },
    });
    if (!res.ok) throw new Error(`GitHub said ${res.status} when listing your repos`);
    const data = await res.json();
    repos.push(...data.map((r) => ({ name: r.full_name, archived: r.archived })));
    if (data.length < 100) break;
  }
  return repos;
}

/** Checks every repo you own on GitHub, a few at a time. */
export async function checkMine({ json = false } = {}) {
  const repos = await listMine();
  if (!json) console.log(`${c.bold('forkguard')}  checking ${repos.length} of your repos on GitHub, every branch\n`);
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < repos.length) {
      const r = repos[next++];
      const res = await checkRemote({ url: `https://github.com/${r.name}.git`, name: r.name });
      res.archived = r.archived;
      results.push(res);
      if (!json) {
        const findings = (res.branches || []).flatMap((b) => b.findings);
        const high = findings.some((f) => f.level === 'high');
        const [text, color] = res.error ? ['could not check', c.red] : high ? ['INFECTED', c.red] : findings.length ? ['worth a look', c.yellow] : ['clean', c.green];
        console.log(`  ${color(text.padEnd(17))}${r.name}${r.archived ? c.dim('  (archived)') : ''}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, repos.length) }, worker));
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
