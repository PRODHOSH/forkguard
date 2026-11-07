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

export const CONFIG_RE = /(^|\/)(postcss|tailwind|eslint|next|vite|babel|jest|webpack|astro|vue|nuxt|svelte|rollup|tsup|vitest)\.config\.[cm]?[jt]s$/;

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
export function findHiddenTail(text) {
  let offset = 0;
  for (const line of text.split('\n')) {
    if (line.length >= 1530) {
      const m = /[ \t]{30,}\S/.exec(line);
      if (m && m.index < 400 && line.length - (m.index + m[0].length) >= 1500) {
        return { line: text.slice(0, offset).split('\n').length, column: m.index, blanks: m[0].length - 1 };
      }
    }
    offset += line.length + 1;
  }
  return null;
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
  const head = buf.subarray(0, 4).toString('latin1');
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
export function badScript(cmd) {
  if (/\bnode\s+(\.\/)?init(\.js)?\b/.test(cmd)) return 'runs a hidden file called init before your real command';
  if (/\bnode\s+\S*(fonts?|assets|public)\/\S+/.test(cmd)) return 'runs a file from a fonts or assets folder';
  return null;
}

export function riskyLifecycle(name, cmd) {
  if (!['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'].includes(name)) return null;
  if (/\b(curl|wget|powershell|iwr|Invoke-WebRequest|certutil)\b|base64|\beval\b|\|\s*(ba)?sh\b/i.test(cmd)) {
    return `"${name}" downloads or decodes something during install`;
  }
  return null;
}
