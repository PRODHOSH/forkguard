import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  BAD_PACKAGES, CODE_EXT, CONFIG_RE, DROPPER_EXT, DROPPER_NAMES, FONT_EXT, LOCKFILES, LONG_LINE, SCRIPT_EXT, SKIP_DIRS,
  badScript, findHiddenTail, findLoader, findMarker, hasPrelude, isHistoryRewriter, isRealFont, longestLine, looksLikeText, riskyLifecycle,
} from './rules.js';
import { isIgnored, realPath, repoRoot, rewrittenHead, toPosix, trackedFiles } from './git.js';

export const MAX_SIZE = 6 * 1024 * 1024;

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

export const isEnvFile = (name) => /^\.env(\.[^/]*)?$/.test(name) && !/example|sample|template/i.test(name);

/** Whether forkguard needs to look inside a file with this name at all. */
export function isInteresting(name, ext) {
  return CODE_EXT.includes(ext) || name === 'init' || FONT_EXT.includes(ext) || DROPPER_NAMES.has(name.toLowerCase()) ||
    DROPPER_EXT.includes(ext) || SCRIPT_EXT.includes(ext) || ['package.json', '.gitignore', 'tasks.json', 'settings.json', 'extension.json', 'README.md'].includes(name) ||
    LOCKFILES.has(name);
}

/**
 * Runs every rule on one file. Shared by the folder scan and the GitHub link scan, so both
 * catch exactly the same things. `buf` is the file's bytes.
 */
export function inspect(f, buf, add, fontDirs) {
  const isCode = CODE_EXT.includes(f.ext);
  const isInit = f.name === 'init';

  if (DROPPER_NAMES.has(f.name.toLowerCase()) || DROPPER_EXT.includes(f.ext)) {
    add('high', f.rel, 'dropper', 'File this malware drops to spread itself', 'delete');
    return;
  }
  if (!buf) return;

  if (FONT_EXT.includes(f.ext)) {
    if (!isRealFont(buf, f.ext)) {
      const head = buf.subarray(0, 4096).toString('utf8');
      const isScript = looksLikeText(buf) && !/^\s*</.test(head) &&
        /\bfunction\b|=>|\brequire\s*\(|\b(var|const|let)\s|\beval\b|global\[/.test(head);
      add(isScript ? 'high' : 'medium', f.rel, 'fake-font',
        isScript ? 'Pretends to be a font but is actually code' : 'Is not a real font file (maybe a broken download)', isScript ? 'delete' : null);
      const dir = path.posix.dirname(f.rel);
      fontDirs.set(dir, { ...(fontDirs.get(dir) || {}), fake: true });
    }
    return;
  }

  const text = buf.toString('utf8');

  if (f.name === 'README.md') {
    if (/fonts?$/i.test(path.posix.dirname(f.rel)) && /Blockchain ?(Explorer|Font)/.test(text)) {
      const dir = path.posix.dirname(f.rel);
      fontDirs.set(dir, { ...(fontDirs.get(dir) || {}), decoy: true });
    }
    return;
  }

  if (isCode || isInit) {
    const tail = findHiddenTail(text);
    const marker = findMarker(text);
    const loader = findLoader(text);
    if (loader) {
      add('high', f.rel, 'loader', 'Downloads code from a hidden URL in an env variable and runs it', isInit ? 'delete' : 'strip');
    }
    if (tail || marker) {
      const where = tail ? `Code hidden after ${tail.blanks} blank spaces on line ${tail.line}` : 'Contains a known malware signature';
      add('high', f.rel, 'hidden-code', where, isInit ? 'delete' : 'strip');
    } else if (CONFIG_RE.test(f.rel) && hasPrelude(text) && text.includes('exports: {}')) {
      add('medium', f.rel, 'prelude', 'Has the fake require() lines this malware adds to configs', 'strip');
    } else if (CONFIG_RE.test(f.rel) && longestLine(text) >= LONG_LINE) {
      add('medium', f.rel, 'config-long-line', `Config file has a ${longestLine(text)} character line. Real configs do not, injected code does`);
    }
    return;
  }

  if (SCRIPT_EXT.includes(f.ext)) {
    if (isHistoryRewriter(text)) add('high', f.rel, 'dropper', 'Script that rewrites your last commit and force pushes it, how this malware spreads', 'delete');
    return;
  }

  if (f.name === 'extension.json' && f.rel.includes('.vscode/')) {
    add('medium', f.rel, 'odd-vscode-file', 'Not a real VS Code file (the real one is extensions.json). Seen in infected repos');
    return;
  }

  if (f.name === 'package.json') {
    let pkg;
    try { pkg = JSON.parse(text); } catch { return; }
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      const why = badScript(String(cmd));
      if (why) add('high', f.rel, 'script', `"${name}" ${why}`, 'script');
      const risky = riskyLifecycle(name, String(cmd));
      if (risky) add('medium', f.rel, 'lifecycle', risky);
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    for (const bad of BAD_PACKAGES) {
      if (deps[bad]) add('high', f.rel, 'bad-package', `Depends on ${bad}, a known malicious package`);
    }
    return;
  }

  if (LOCKFILES.has(f.name)) {
    for (const bad of BAD_PACKAGES) {
      if (text.includes(`node_modules/${bad}"`) || text.includes(`"${bad}@`) || text.includes(`\n${bad}@`) || text.includes(`/${bad}@`)) {
        add('high', f.rel, 'bad-package', `Lockfile pulls in ${bad}, a known malicious package`);
      }
    }
    return;
  }

  if (f.name === 'tasks.json' && f.rel.includes('.vscode/')) {
    if (/folderOpen/.test(text)) {
      const runs = /"(node|curl|wget|powershell|pwsh|cmd|bash|sh|python3?)"|\b(node|curl|wget|powershell)\s|fonts?\/|vercel\.app|onrender\.com|railway\.app|\|\s*(ba)?sh\b/.test(text);
      add(runs ? 'high' : 'medium', f.rel, 'autorun',
        runs ? 'VS Code task runs a hidden command the moment you open the folder' : 'VS Code task runs when you open the folder', 'autorun');
    }
    return;
  }

  if (f.name === 'settings.json' && f.rel.includes('.vscode/')) {
    if (/"task\.allowAutomaticTasks"\s*:\s*("on"|true)/.test(text)) {
      add('medium', f.rel, 'autorun-setting', 'Turns on automatic VS Code tasks so the hidden task can run', 'setting');
    }
    return;
  }

  if (f.name === '.gitignore' && /^\s*(config\.bat|temp_auto_push\.bat)\s*$/m.test(text)) {
    add('medium', f.rel, 'gitignore', 'Hides config.bat, a file this malware drops', 'gitignore');
  }
}

/** Adds decoy folder findings and sorts the list, most serious first. */
export function finish(findings, fontDirs, add) {
  for (const [dir, info] of fontDirs) {
    if (info.fake && info.decoy) add('high', `${dir}/`, 'decoy-folder', 'Decoy fonts folder planted to hide the fake font', 'delete-dir');
  }
  const order = { high: 0, medium: 1 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file));
  return findings;
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
