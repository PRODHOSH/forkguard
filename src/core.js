// forkguard core: every rule, with no Node-only imports, so it runs anywhere JavaScript runs:
// the CLI, a Cloudflare Worker, a browser. Feed it a file name and its bytes (a Buffer or any
// Uint8Array) and it tells you what is wrong. Reading files and talking to git is somebody else's job.
import {
  BAD_PACKAGES, CODE_EXT, CONFIG_RE, DROPPER_EXT, DROPPER_NAMES, FONT_EXT, GRADLE_RE, LOCKFILES, LONG_LINE, SCRIPT_EXT, SHELL_EXT, WORKFLOW_EXT,
  badScript, findChainLoader, findCiMarker, findDecodeExec, findGradleLoader, findHiddenTail, findLoader, findMarker, findPythonLoader, hasPrelude, isBareName, isHistoryRewriter, isRealFont,
  longestLine, looksLikeText, riskyLifecycle,
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

/** `.env.example`, `.env.local.example` and friends: a project that ships one expects real .env files next to it. */
export const isEnvExample = (name) => /^\.env(\.[^/]*)?$/.test(name) && /example|sample|template/i.test(name);

export const isEnvFile = (name) => /^\.env(\.[^/]*)?$/.test(name) && !/example|sample|template/i.test(name);

/** Whether forkguard needs to look inside a file with this name at all. */
export function isInteresting(name, ext) {
  // A file with no extension (`init`, `service`, ...) is where the loader hides, whatever it is called.
  return CODE_EXT.includes(ext) || SHELL_EXT.includes(ext) || WORKFLOW_EXT.includes(ext) || name === 'init' || ext === '.py' || GRADLE_RE.test(name) || (ext === '' && isBareName(name)) || FONT_EXT.includes(ext) || DROPPER_NAMES.has(name.toLowerCase()) ||
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
  const isBare = f.ext === '' && isBareName(f.name);

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

  if (f.ext === '.py') {
    const verdict = findPythonLoader(text);
    if (verdict) {
      add('high', f.rel, 'python-loader',
        verdict === 'delete' ? 'Python file that reads code from a blockchain API and runs it with node' : 'Python code that reads code from a blockchain API and runs it with node. It sits inside a real file, so remove it by hand',
        verdict === 'delete' ? 'delete' : null);
    }
    return;
  }

  if (GRADLE_RE.test(f.rel)) {
    const g = findGradleLoader(text);
    if (g.tasks.length) add('high', f.rel, 'gradle-loader', `Gradle task "${g.tasks[0]}" starts a hidden node process every time you build`, 'gradle');
    else if (g.hook) add('high', f.rel, 'gradle-loader', `Every build runs the "${g.hook}" task first, and it looks like a hidden launcher`, 'gradle');
    return;
  }

  if (isCode || isInit || isBare) {
    const tail = findHiddenTail(text);
    const marker = findMarker(text);
    const loader = findLoader(text);
    const chain = findChainLoader(text);
    if (chain) {
      add('high', f.rel, 'chain-loader', chain === 'encoded' ? 'Reads a payload from a blockchain API (the names are hidden as base64) and runs it' : 'Reads a payload from a blockchain API and runs it', tail || marker ? null : null);
    }
    if (!chain && findDecodeExec(text)) {
      add('high', f.rel, 'decode-exec', 'Decodes data, fetches something over the network and runs the result, which is how the loader works');
    }
    if (loader) {
      add('high', f.rel, 'loader', 'Downloads code from a hidden URL in an env variable and runs it', isInit || isBare ? 'delete' : 'strip');
    }
    if (tail || marker) {
      const where = tail ? `Code hidden after ${tail.blanks} blank ${tail.kind === 'lines' ? 'lines' : 'spaces'} on line ${tail.line}` : 'Contains a known malware signature';
      add('high', f.rel, 'hidden-code', where, isInit || isBare ? 'delete' : 'strip');
    } else if (CONFIG_RE.test(f.rel) && hasPrelude(text) && text.includes('exports: {}')) {
      add('medium', f.rel, 'prelude', 'Has the fake require() lines this malware adds to configs', 'strip');
    } else if (CONFIG_RE.test(f.rel) && longestLine(text) >= LONG_LINE) {
      add('medium', f.rel, 'config-long-line', `Config file has a ${longestLine(text)} character line. Real configs do not, injected code does`);
    }
    return;
  }

  if (WORKFLOW_EXT.includes(f.ext)) {
    if (f.rel.includes('.github/workflows/') && findCiMarker(text)) {
      add('high', f.rel, 'ci-stealer', 'GitHub Actions workflow contains a known CI secret stealer');
    }
    return;
  }

  if (SCRIPT_EXT.includes(f.ext) || SHELL_EXT.includes(f.ext)) {
    if (isHistoryRewriter(text)) add('high', f.rel, 'dropper', 'Script that rewrites your last commit and force pushes it, how this malware spreads', 'delete');
    if (findCiMarker(text)) add('high', f.rel, 'ci-stealer', 'Shell script contains a known CI secret stealer', /^\.ci-/.test(f.name) ? 'delete' : null);
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
    // A task can also be written straight into settings.json. Same trick as tasks.json: it runs when you open the folder.
    if (/folderOpen/.test(text)) {
      const runs = /"(node|curl|wget|powershell|pwsh|cmd|bash|sh|python3?)"|\b(node|curl|wget|powershell)\s|fonts?\/|vercel\.app|onrender\.com|railway\.app|\|\s*(ba)?sh\b/.test(text);
      add(runs ? 'high' : 'medium', f.rel, 'autorun-setting',
        runs ? 'A VS Code task hidden in settings.json runs a command the moment you open the folder' : 'A task in settings.json is set to run when you open the folder', 'setting');
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
