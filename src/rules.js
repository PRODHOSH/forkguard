// Everything forkguard knows about what this kind of malware looks like.
// Marker strings are split into pieces so this file never matches its own rules
// and antivirus tools do not mistake it for the real thing.

const j = (...parts) => parts.join('');

export const MARKERS = [
  j("global['", "r']=require"),
  j("global['", "r'] = require"),
  j("global['", "!']"),
  j("global['", "_V']"),
  j('global["', '_V"]'),
  j('_$_', '1e42'),
  j('rmcej', '%otb%'),
  j('Cot%3t', '=shtP'),
  j('api.trongrid', '.io/v1/accounts'),
  j('fullnode.mainnet', '.aptoslabs.com'),
  j('default-configuration', '.vercel.app'),
  j('vscode-settings-bootstrap', '.vercel.app'),
  j('vscode-settings-config', '.vercel.app'),
  j('vscode-bootstrapper', '.vercel.app'),
  j('vscode-load-config', '.vercel.app'),
  j('260120', '.vercel.app'),
  // April 2026 variant and its keys (OpenSourceMalware PolinRider dossier).
  j('function M', 'Dy(f)'),
  j('2[gWfGj;<:', '-93Z^C'),
  j('m6:tTh^D', ')cBz?NM]'),
  j('TMfKQEd7TJJa5xNZJZ2', 'Lep838vrzrs7mAP'),
  j('TXfxHUet9pJVU1BgVkBAbrES4', 'YUc1nGzcG'),
  j('e9b53a7c-2342-4b15', '-b02d-bd8b8f6a03f9'),
];

// npm packages that are known to carry this payload.
export const BAD_PACKAGES = [
  'tailwindcss-style-animate',
  'tailwind-mainanimation',
  'tailwind-autoanimation',
  'tailwind-animationbased',
  'tailwindcss-typography-style',
  'tailwindcss-style-modify',
  'tailwindcss-animate-style',
];

// Lines the malware adds to the top of ES module configs so its hidden code can call require().
export const PRELUDE = new Set([
  j('import { create', "Require } from 'module';"),
  j('import { create', 'Require } from "module";'),
  j('const require = create', 'Require(import.meta.url);'),
  j('var require = create', 'Require(import.meta.url);'),
  j('var module = { exp', 'orts: {} };'),
]);

// Files the malware drops next to your code.
export const DROPPER_NAMES = new Set(['config.bat', 'temp_auto_push.bat']);
export const DROPPER_EXT = ['.orc'];

export const CODE_EXT = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.vue', '.svelte'];
export const FONT_EXT = ['.woff', '.woff2', '.ttf', '.otf', '.ttc', '.eot'];

export const CONFIG_RE = /(^|\/)((postcss|tailwind|eslint|next|vite|babel|jest|webpack|astro|vue|nuxt|svelte|rollup|tsup|vitest|gridsome|playwright|cypress|metro|drizzle|prettier|commitlint|knip|tsdown|unbuild)\.config\.[cm]?[jt]s|truffle\.js)$/;

// A config file has no reason to hold a line this long. Injected payloads are one enormous line.
export const LONG_LINE = 1000;
export const longestLine = (text) => text.split('\n').reduce((m, l) => Math.max(m, l.length), 0);

// Scripts that rewrite your last commit and force push it: the malware's way of hiding and spreading.
export const SCRIPT_EXT = ['.bat', '.cmd', '.sh'];
export function isHistoryRewriter(text) {
  return /LAST_COMMIT_(DATE|TIME)/.test(text) ||
    (/commit\s+[^\n]*--amend/.test(text) && /--no-verify/.test(text) && /push\s+[^\n]*(-\w*f\b|--force)/.test(text));
}

export const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', '.output',
  'dist', 'build', 'out', 'coverage', '.cache', '.parcel-cache', 'vendor', '__pycache__', '.venv', 'venv',
]);

export const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock']);

// Package manager and git subcommands that make forkguard check the project first.
export const GATED = {
  npm: new Set(['install', 'i', 'ci', 'add', 'run', 'run-script', 'dev', 'start', 'build', 'test', 'exec', 'x', 'rebuild']),
  pnpm: new Set(['install', 'i', 'add', 'run', 'dev', 'start', 'build', 'test', 'exec', 'dlx']),
  yarn: new Set(['', 'install', 'add', 'run', 'dev', 'start', 'build', 'test', 'dlx']),
  bun: new Set(['install', 'i', 'add', 'run', 'dev', 'start', 'build', 'test', 'x']),
  git: new Set(['clone', 'pull', 'merge', 'checkout', 'switch']),
};

/**
 * Finds code tucked behind a long run of spaces on a line. The payload is pushed far to the
 * right so it is invisible in an editor, after a normal looking line like `export default config;`.
 * Returns where the hidden part starts, or null.
 */
const spaceRatio = (s) => (s.length ? (s.split(' ').length - 1) / s.length : 0);

/**
 * One line, checked for code tucked behind a long run of blanks. Returns where it starts, or null.
 * Real payloads were seen with 199, 249, 300 and 776 blanks and tails from 1,200 to several thousand characters,
 * so no single length is trusted. Three shapes are flagged:
 *   1. 30 or more blanks and a tail of 1,500 characters or more, whatever the tail looks like
 *   2. 40 or more blanks and a tail of 150 characters or more that is packed tight
 *   3. 100 or more blanks and any tail of 30 characters or more that is packed tight
 * "Packed tight" means almost no spaces. Hand-aligned code reads like English, with spaces between its words,
 * so a table of props with a long run of blanks is left alone.
 */
export function hiddenTailAt(line) {
  if (line.length < 70) return null;
  const m = /[ \t]{30,}\S/.exec(line);
  if (!m || m.index >= 400) return null;
  const blanks = m[0].length - 1;
  const rest = line.slice(m.index + m[0].length - 1);
  const tail = rest.length;
  const hit = { column: m.index, blanks, end: m.index };
  if (blanks >= 30 && tail >= 1500) return hit;
  if (blanks >= 40 && tail >= 150 && spaceRatio(rest) < 0.04) return hit;
  if (blanks >= 100 && tail >= 30 && spaceRatio(rest) < 0.05) return hit;
  return null;
}

/**
 * The other way to hide it: more than a hundred empty lines, then the code. An editor opens at the top and
 * shows nothing wrong. Returns where the run starts and where the code starts (line numbers from 0), or null.
 */
export function findBlankLineRun(text) {
  const lines = text.split('\n');
  let run = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) { run++; continue; }
    if (run >= 120 && lines[i].length >= 150 && spaceRatio(lines[i]) < 0.05) return { start: i - run, end: i, lines: run };
    run = 0;
  }
  return null;
}

export function findHiddenTail(text) {
  let offset = 0;
  for (const line of text.split('\n')) {
    const hit = hiddenTailAt(line);
    if (hit) return { line: text.slice(0, offset).split('\n').length, column: hit.column, blanks: hit.blanks, kind: 'spaces' };
    offset += line.length + 1;
  }
  const lines = findBlankLineRun(text);
  return lines ? { line: lines.end + 1, column: 0, blanks: lines.lines, kind: 'lines' } : null;
}

/**
 * The second variant: no hidden spaces at all. A small block decodes a URL kept in an env var,
 * downloads code from it and runs it with eval. Plain to see, but easy to skim past.
 * Returns the matched block(s) so fix can cut exactly those, or null.
 */
const LOADER_RE = /\(\s*async\s*\(\s*\)\s*=>\s*\{(?:(?!\}\s*\)\s*\(\s*\)\s*;?)[\s\S]){0,1500}?atob\s*\(\s*process\.env\.[\w$]+\s*\)(?:(?!\}\s*\)\s*\(\s*\)\s*;?)[\s\S]){0,1500}?\beval\s*\([\s\S]{0,600}?\}\s*\)\s*\(\s*\)\s*;?/g;

export function findLoader(text) {
  if (!/atob\s*\(\s*process\.env/.test(text) || !/\beval\s*\(/.test(text)) return null;
  const blocks = text.match(LOADER_RE);
  return blocks && blocks.length ? blocks : null;
}

export function stripLoader(text) {
  return text.replace(LOADER_RE, '');
}

export function findMarker(text) {
  return MARKERS.find((m) => text.includes(m)) || null;
}

export function hasPrelude(text) {
  return text.split(/\r?\n/).some((l) => PRELUDE.has(l.trim()));
}

/** True when the bytes start like a real font file. */
export function isRealFont(buf, ext) {
  if (buf.length === 0) return true; // an empty placeholder is odd but harmless
  const head = String.fromCharCode(...buf.subarray(0, 4)); // works for a Buffer and a plain Uint8Array
  if (['wOFF', 'wOF2', 'OTTO', 'true', 'ttcf', '\x00\x01\x00\x00'].includes(head)) return true;
  if (ext === '.eot' && buf.length > 36 && buf[34] === 0x4c && buf[35] === 0x50) return true;
  return false;
}

/** True when the bytes look like readable source code instead of binary data. */
export function looksLikeText(buf) {
  const sample = buf.subarray(0, 512);
  if (sample.length === 0) return false;
  let printable = 0;
  for (const b of sample) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++;
  return printable / sample.length > 0.95;
}

/** Script commands in package.json that run the hidden loader before the real command. */
// `node init`, `node ./init`, `node init.js` or a bare `node service` as a whole word. Not `node init-db.js`, `node initialize.js` or `node service.js`.
export const INIT_CMD = String.raw`node\s+(?:\.\/)?(?:init(?:\.js)?|service)(?=\s|&|;|\||$|["'])`;
// Running a font file, or anything inside a fonts folder, as code. Not `node public/make-sitemap.js`.
export const FONT_CMD = String.raw`node\s+\S*(?:fonts?\/\S+|\.(?:ttf|woff2?|otf|eot|ttc)(?=\s|&|;|\||$|["']))`;

export function badScript(cmd) {
  const hit = new RegExp(INIT_CMD).exec(cmd);
  if (hit) return `runs a hidden file called ${/service/.test(hit[0]) ? 'service' : 'init'} before your real command`;
  if (new RegExp(FONT_CMD).test(cmd)) return 'runs a font file or a file from a fonts folder as code';
  return null;
}

export function riskyLifecycle(name, cmd) {
  if (!['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'].includes(name)) return null;
  if (/\b(curl|wget|powershell|iwr|Invoke-WebRequest|certutil)\b|base64|\beval\b|\|\s*(ba)?sh\b/i.test(cmd)) {
    return `"${name}" downloads or decodes something during install`;
  }
  return null;
}

/** A project file with no extension and no dot in its name, such as `init` or `service`. The loader hides in one of these. */
export const isBareName = (name) => !name.includes('.');

// Gradle files: a build file has no reason to start a hidden node process.
export const GRADLE_RE = /(^|\/)(build|settings)\.gradle(\.kts)?$/;
const GRADLE_LAUNCH = /nohup\s+node\b|Start-Process\s+(?:-FilePath\s+)?['"]?node\b/i;
const GRADLE_TASK = /(?:tasks\.register\(\s*["']\w+["'][^)]*\)|task\s+\w+\s*\([^)]*\)|tasks\.register\s*<[^>]*>\s*\(\s*["']\w+["'][^)]*\))\s*\{/g;
// A task named like a server that another build file is told to run first.
const GRADLE_HOOK = /dependsOn\(\s*rootProject\.tasks\.named\(\s*["']([A-Za-z]*(?:start|run|launch|api|server|service|daemon)[A-Za-z]*)["']\s*\)\s*\)/i;

/** The index just after the `}` that closes the block opened at `open` (the index of its `{`), or -1. */
function blockEnd(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

/** Finds Gradle tasks that start a hidden node process, and build files that run a task like that first. */
export function findGradleLoader(text) {
  const tasks = [];
  for (const m of text.matchAll(GRADLE_TASK)) {
    const end = blockEnd(text, m.index + m[0].length - 1);
    if (end !== -1 && GRADLE_LAUNCH.test(text.slice(m.index, end))) tasks.push(/["'](\w+)["']/.exec(m[0])?.[1] || /task\s+(\w+)/.exec(m[0])?.[1]);
  }
  const hook = GRADLE_HOOK.exec(text);
  return { tasks: tasks.filter(Boolean), hook: hook ? hook[1] : null };
}

/** Cuts the launching task out of a Gradle file, and the line that makes a build run it. */
export function cleanGradle(text) {
  let out = text;
  const names = [];
  for (let again = true; again;) {
    again = false;
    for (const m of out.matchAll(GRADLE_TASK)) {
      const end = blockEnd(out, m.index + m[0].length - 1);
      if (end !== -1 && GRADLE_LAUNCH.test(out.slice(m.index, end))) {
        names.push(/["'](\w+)["']/.exec(m[0])?.[1] || /task\s+(\w+)/.exec(m[0])?.[1]);
        out = out.slice(0, m.index).replace(/[ \t]*$/, '') + out.slice(end).replace(/^[ \t]*\r?\n/, '');
        again = true;
        break;
      }
    }
  }
  const hook = GRADLE_HOOK.exec(out);
  if (hook) names.push(hook[1]);
  for (const name of names.filter(Boolean)) {
    const ref = `["']${name}["']`;
    // tasks.named("preBuild") { dependsOn(rootProject.tasks.named("startApi")) }
    out = out.replace(new RegExp(`[ \\t]*tasks\\.named\\(\\s*["']\\w+["']\\s*\\)\\s*\\{\\s*dependsOn\\([^\\n]*${ref}[^\\n]*\\)\\s*\\}[ \\t]*\\r?\\n?`, 'g'), '');
    // preBuild.dependsOn startApi, or a dependsOn line on its own
    out = out.replace(new RegExp(`^[ \\t]*[\\w.]*dependsOn[^\\n]*(?:${ref}|\\b${name}\\b)[^\\n]*\\r?\\n`, 'gm'), '');
  }
  return out === text ? null : out.replace(/(\r?\n){3,}/g, '$1$1');
}

// Python that reads a payload from a blockchain API and hands it to node.
const CHAIN_API = /ethplorer|getAddressTransactions|eth_getTransactionByHash|api\.trongrid|aptoslabs|etherscan\.io\/api|bscscan\.com\/api/i;
export const CHAIN_GREP = 'ethplorer|getAddressTransactions|eth_getTransactionByHash|api.trongrid|aptoslabs|etherscan.io/api|bscscan.com/api';

/** Returns 'delete' when the whole file is the loader, 'review' when it sits inside real code, or null. */
export function findPythonLoader(text) {
  if (!CHAIN_API.test(text)) return null;
  if (!/subprocess|os\.system|\bPopen\b|_sp\.run/.test(text)) return null;
  if (!/["']node["']|\bnode\s+\S+\.js/.test(text)) return null;
  return /^\s*(def|class)\s/m.test(text) ? 'review' : 'delete';
}

// A payload read from a blockchain API and run, in JavaScript or TypeScript. The API names are often
// hidden as base64, so both the plain words and their base64 forms are looked for. Split here so this
// file never contains them whole.
const CHAIN_WORDS = [j('eth', 'plorer'), j('getAddress', 'Transactions'), j('eth_getTransaction', 'ByHash'), j('api.tron', 'grid'), j('apto', 'slabs')];
// base64 of a word depends on where it sits among the three-letter groups, so look for all three alignments.
const b64Forms = (s) => [0, 1, 2].map((k) => {
  const sub = s.slice(k);
  const n = sub.length - (sub.length % 3);
  return n >= 6 ? btoa(sub.slice(0, n)) : null;
}).filter(Boolean);
export const CHAIN_NEEDLES = [...CHAIN_WORDS, ...CHAIN_WORDS.flatMap(b64Forms)];
const RUNNER = /new\s+Function\s*\(|\beval\s*\)?\s*\(|\bFunction\s*\(\s*["']/;

/** 'plain' or 'encoded' when a code file reads from a blockchain API and also runs what it gets. */
export function findChainLoader(text) {
  if (!RUNNER.test(text)) return null;
  if (CHAIN_WORDS.some((w) => text.includes(w))) return 'plain';
  return b64Forms ? (CHAIN_NEEDLES.slice(CHAIN_WORDS.length).some((n) => text.includes(n)) ? 'encoded' : null) : null;
}

// What the loader does, whatever it looks like and however it is hidden: it decodes data, fetches something
// over the network and runs the result. Each piece is common on its own. All three close together is not.
const DECODER = /\batob\s*\(|Buffer\.from\([^)]{0,200}["'](?:base64|hex)["']|\bfromCharCode\b/g;
const EXECUTOR = /new\s+Function\s*\(|(?<![.\w])eval\s*\(|\(\s*0\s*,\s*eval\s*\)|\bvm\.(?:runIn\w+|Script)\b|\._compile\s*\(/g;
const FETCHER = /\bfetch\s*\(|\bhttps?\.(?:get|request)\s*\(|require\(\s*["']https?["']\s*\)|XMLHttpRequest|node-fetch|\baxios\b/;
export const DECODE_EXEC_GREP = ['atob\\(', 'Buffer\\.from\\([^)]*(base64|hex)', 'fromCharCode'];
export const EXEC_GREP = ['new\\s+Function\\s*\\(', '\\beval\\s*\\(', 'vm\\.run', '_compile\\s*\\('];

/** True when a code file decodes data, fetches from the network and runs the result, all within a few lines of each other. */
export function findDecodeExec(text) {
  if (text.length > 300000) return false; // a bundled library, not a loader
  for (const m of text.matchAll(EXECUTOR)) {
    const near = text.slice(Math.max(0, m.index - 1800), m.index + 1800);
    DECODER.lastIndex = 0;
    if (DECODER.test(near) && FETCHER.test(near)) return true;
  }
  return false;
}
