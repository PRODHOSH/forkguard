import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BAD_PACKAGES, DROPPER_EXT, DROPPER_NAMES, MAX_SIZE, SKIP_DIRS, findHiddenTail, findMarker, finish, inspect, isEnvFile, isInteresting } from './core.js';
import { isIgnored, realPath, repoRoot, rewrittenHead, toPosix, trackedFiles } from './git.js';

// The rules live in core.js, which has no Node-only imports. Re-exported so existing imports keep working.
export { MAX_SIZE, finish, inspect, isEnvFile, isInteresting };

function* walk(root, dir = root) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(root, full);
    } else if (e.isFile()) {
      yield { full, rel: toPosix(path.relative(root, full)), name: e.name, ext: path.extname(e.name).toLowerCase() };
    }
  }
}

function read(full) {
  try {
    if (statSync(full).size > MAX_SIZE) return null;
    return readFileSync(full);
  } catch {
    return null; // antivirus may lock or remove a file while we look at it
  }
}

/** Where npm's own entry file lives for the Node.js that is running forkguard. */
function npmCliCandidates() {
  const nodeDir = path.dirname(process.execPath);
  const list = [
    path.join(nodeDir, 'node_modules', 'npm', 'lib', 'cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'lib', 'cli.js'),
  ];
  if (process.env.APPDATA) list.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'lib', 'cli.js'));
  for (const prefix of ['/usr/local/lib', '/opt/homebrew/lib', '/usr/lib']) list.push(path.join(prefix, 'node_modules', 'npm', 'lib', 'cli.js'));
  return [...new Set(list.map((p) => path.resolve(p)))].filter((p) => existsSync(p));
}

/**
 * The malware can also hide inside npm itself, so every npm command restarts it even after your
 * projects are clean. A healthy lib/cli.js is a few hundred bytes. forkguard never runs npm to find it.
 */
export function checkNpm() {
  const found = [];
  for (const file of npmCliCandidates()) {
    const buf = read(file);
    if (!buf) continue;
    const text = buf.toString('utf8');
    if (buf.length > 20000 || findHiddenTail(text) || findMarker(text)) {
      found.push({
        level: 'high', file: `npm on this computer (${file})`, rule: 'npm-infected',
        message: `npm itself is infected (${Math.round(buf.length / 1024)} KB, a clean one is under 1 KB). Reinstall Node.js from nodejs.org before running npm again`,
        fix: null,
      });
    }
  }
  return found;
}

/**
 * Looks through a folder and returns every problem it finds.
 * Each finding: { level: 'high' | 'medium', file, rule, message, fix }
 * `fix` says what `forkguard fix` will do, or null when a person has to decide.
 */
export function scan(target) {
  if (!existsSync(target)) throw new Error(`No such folder: ${target}`);
  const root = realPath(path.resolve(target));
  const findings = [];
  const add = (level, file, rule, message, fix = null) => findings.push({ level, file, rule, message, fix });
  let checked = 0;
  const fontDirs = new Map(); // fonts folder -> { fake: bool, decoy: bool }
  const gitRoot = repoRoot(root);
  const tracked = new Set(gitRoot ? trackedFiles(gitRoot) : []);
  const gitPrefix = gitRoot ? toPosix(path.relative(gitRoot, root)) : '';

  for (const f of walk(root)) {
    if (isEnvFile(f.name)) {
      checked++;
      // A .env that git would happily commit. The malware has been seen taking .env out of .gitignore.
      const repoRel = gitPrefix ? `${gitPrefix}/${f.rel}` : f.rel;
      if (gitRoot && !tracked.has(repoRel) && !isIgnored(gitRoot, repoRel)) {
        add('medium', f.rel, 'env-not-ignored', 'Secret file is not in .gitignore, so it could get committed', 'ignore-env');
      }
      continue;
    }
    if (!isInteresting(f.name, f.ext)) continue;
    checked++;
    const needsBytes = !DROPPER_NAMES.has(f.name.toLowerCase()) && !DROPPER_EXT.includes(f.ext);
    inspect(f, needsBytes ? read(f.full) : null, add, fontDirs);

    // A bad package that is already installed has probably run its install step.
    if (f.name === 'package.json') {
      for (const bad of BAD_PACKAGES) {
        const installed = path.join(path.dirname(f.full), 'node_modules', bad);
        if (existsSync(installed)) {
          add('high', toPosix(path.relative(root, installed)), 'bad-package-installed',
            `${bad} is installed here, so its install step may already have run. Delete node_modules, drop it from package.json and treat this computer as exposed`);
        }
      }
    }
  }

  if (gitRoot) {
    for (const file of tracked) {
      const rel = gitPrefix ? (file.startsWith(gitPrefix + '/') ? file.slice(gitPrefix.length + 1) : null) : file;
      if (rel && isEnvFile(path.posix.basename(rel))) add('medium', rel, 'secret', 'Secret file is committed to the repo', 'untrack');
    }
    if (findings.some((f) => f.level === 'high')) {
      const head = rewrittenHead(gitRoot);
      if (head) {
        add('medium', '(latest commit)', 'rewritten',
          `Commit ${head.hash} "${head.subject}" was rewritten: same time, different timezone (${head.authorTz} vs ${head.committerTz})`);
      }
    }
  }

  findings.push(...checkNpm());
  finish(findings, fontDirs, add);
  return { root, findings, checked, gitRoot };
}
