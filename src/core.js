// forkguard core: every rule, with no Node-only imports, so it runs anywhere JavaScript runs:
// the CLI, a Cloudflare Worker, a browser. Feed it a file name and its bytes (a Buffer or any
// Uint8Array) and it tells you what is wrong. Reading files and talking to git is somebody else's job.
import {
  BAD_PACKAGES, CODE_EXT, CONFIG_RE, DROPPER_EXT, DROPPER_NAMES, FONT_EXT, LOCKFILES, LONG_LINE, SCRIPT_EXT,
  badScript, findHiddenTail, findLoader, findMarker, hasPrelude, isHistoryRewriter, isRealFont, longestLine, looksLikeText, riskyLifecycle,
} from './rules.js';

export * from './rules.js';

/** Files larger than this are not looked at. */
export const MAX_SIZE = 6 * 1024 * 1024;

const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });
const decode = (bytes) => utf8.decode(bytes);
const dirname = (rel) => { const i = rel.lastIndexOf('/'); return i === -1 ? '.' : rel.slice(0, i) || '/'; };

/** Splits a repo-relative path into the shape `inspect` wants. */
export function describe(rel) {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return { rel, name, ext: dot > 0 ? name.slice(dot).toLowerCase() : '' };
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
      const head = decode(buf.subarray(0, 4096));
      const isScript = looksLikeText(buf) && !/^\s*</.test(head) &&
        /\bfunction\b|=>|\brequire\s*\(|\b(var|const|let)\s|\beval\b|global\[/.test(head);
      add(isScript ? 'high' : 'medium', f.rel, 'fake-font',
        isScript ? 'Pretends to be a font but is actually code' : 'Is not a real font file (maybe a broken download)', isScript ? 'delete' : null);
      const dir = dirname(f.rel);
      fontDirs.set(dir, { ...(fontDirs.get(dir) || {}), fake: true });
    }
    return;
  }

  const text = decode(buf);

  if (f.name === 'README.md') {
    if (/fonts?$/i.test(dirname(f.rel)) && /Blockchain ?(Explorer|Font)/.test(text)) {
      const dir = dirname(f.rel);
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
