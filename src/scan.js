import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  BAD_PACKAGES, CODE_EXT, CONFIG_RE, DROPPER_EXT, DROPPER_NAMES, FONT_EXT, LOCKFILES, SKIP_DIRS,
  badScript, findHiddenTail, findMarker, hasPrelude, isRealFont, looksLikeText, riskyLifecycle,
} from './rules.js';
import { repoRoot, rewrittenHead, toPosix, trackedFiles } from './git.js';

const MAX_SIZE = 6 * 1024 * 1024;

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
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.forkguard')) yield* walk(root, full);
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

/**
 * Looks through a folder and returns every problem it finds.
 * Each finding: { level: 'high' | 'medium', file, rule, message, fix }
 * `fix` says what `forkguard fix` will do, or null when a person has to decide.
 */
export function scan(target) {
  const root = path.resolve(target);
  if (!existsSync(root)) throw new Error(`No such folder: ${target}`);
  const findings = [];
  const add = (level, file, rule, message, fix = null) => findings.push({ level, file, rule, message, fix });
  let checked = 0;
  const fontDirs = new Map(); // fonts folder -> { fake: bool, decoy: bool }

  for (const f of walk(root)) {
    const isCode = CODE_EXT.includes(f.ext);
    const isInit = f.name === 'init';
    const isFont = FONT_EXT.includes(f.ext);
    const interesting = isCode || isInit || isFont || DROPPER_NAMES.has(f.name.toLowerCase()) ||
      DROPPER_EXT.includes(f.ext) || ['package.json', '.gitignore', 'tasks.json', 'settings.json', 'README.md'].includes(f.name) ||
      LOCKFILES.has(f.name);
    if (!interesting) continue;
    checked++;

    if (DROPPER_NAMES.has(f.name.toLowerCase()) || DROPPER_EXT.includes(f.ext)) {
      add('high', f.rel, 'dropper', 'File this malware drops to spread itself', 'delete');
      continue;
    }

    const buf = read(f.full);
    if (!buf) continue;

    if (isFont) {
      if (!isRealFont(buf, f.ext)) {
        const text = looksLikeText(buf);
        add(text ? 'high' : 'medium', f.rel, 'fake-font',
          text ? 'Pretends to be a font but is actually code' : 'Does not look like a real font file', text ? 'delete' : null);
        const dir = path.posix.dirname(f.rel);
        fontDirs.set(dir, { ...(fontDirs.get(dir) || {}), fake: true });
      }
      continue;
    }

    const text = buf.toString('utf8');

    if (f.name === 'README.md') {
      if (/fonts?$/i.test(path.posix.dirname(f.rel)) && /Blockchain ?(Explorer|Font)/.test(text)) {
        const dir = path.posix.dirname(f.rel);
        fontDirs.set(dir, { ...(fontDirs.get(dir) || {}), decoy: true });
      }
      continue;
    }

    if (isCode || isInit) {
      const tail = findHiddenTail(text);
      const marker = findMarker(text);
      if (tail || marker) {
        const where = tail ? `Code hidden after ${tail.blanks} blank spaces on line ${tail.line}` : 'Contains a known malware signature';
        add('high', f.rel, 'hidden-code', where, isInit ? 'delete' : 'strip');
      } else if (CONFIG_RE.test(f.rel) && hasPrelude(text) && text.includes('exports: {}')) {
        add('medium', f.rel, 'prelude', 'Has the fake require() lines this malware adds to configs', 'strip');
      }
      continue;
    }

    if (f.name === 'package.json') {
      let pkg;
      try { pkg = JSON.parse(text); } catch { continue; }
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
      continue;
    }

    if (LOCKFILES.has(f.name)) {
      for (const bad of BAD_PACKAGES) {
        if (text.includes(`node_modules/${bad}"`) || text.includes(`"${bad}@`) || text.includes(`\n${bad}@`) || text.includes(`/${bad}@`)) {
          add('high', f.rel, 'bad-package', `Lockfile pulls in ${bad}, a known malicious package`);
        }
      }
      continue;
    }

    if (f.name === 'tasks.json' && f.rel.includes('.vscode/')) {
      if (/folderOpen/.test(text)) {
        const runs = /"(node|curl|wget|powershell|pwsh|cmd|bash|sh|python3?)"|\b(node|curl|wget|powershell)\s|fonts?\//.test(text);
        add(runs ? 'high' : 'medium', f.rel, 'autorun',
          runs ? 'VS Code task runs a hidden command the moment you open the folder' : 'VS Code task runs when you open the folder', 'autorun');
      }
      continue;
    }

    if (f.name === 'settings.json' && f.rel.includes('.vscode/')) {
      if (/"task\.allowAutomaticTasks"\s*:\s*("on"|true)/.test(text)) {
        add('medium', f.rel, 'autorun-setting', 'Turns on automatic VS Code tasks so the hidden task can run', 'setting');
      }
      continue;
    }

    if (f.name === '.gitignore') {
      if (/^\s*(config\.bat|temp_auto_push\.bat)\s*$/m.test(text)) {
        add('medium', f.rel, 'gitignore', 'Hides config.bat, a file this malware drops', 'gitignore');
      }
    }
  }

  for (const [dir, info] of fontDirs) {
    if (info.fake && info.decoy) add('high', `${dir}/`, 'decoy-folder', 'Decoy fonts folder planted to hide the fake font', 'delete-dir');
  }

  const gitRoot = repoRoot(root);
  if (gitRoot) {
    const prefix = toPosix(path.relative(gitRoot, root));
    for (const file of trackedFiles(gitRoot)) {
      const rel = prefix ? (file.startsWith(prefix + '/') ? file.slice(prefix.length + 1) : null) : file;
      if (rel && /(^|\/)\.env(\.[^/]*)?$/.test(rel) && !/example|sample|template/i.test(rel)) {
        add('medium', rel, 'secret', 'Secret file is committed to the repo', 'untrack');
      }
    }
    if (findings.some((f) => f.level === 'high')) {
      const head = rewrittenHead(gitRoot);
      if (head) {
        add('medium', '(latest commit)', 'rewritten',
          `Commit ${head.hash} "${head.subject}" was rewritten: same time, different timezone (${head.authorTz} vs ${head.committerTz})`);
      }
    }
  }

  const order = { high: 0, medium: 1 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file));
  return { root, findings, checked, gitRoot };
}
