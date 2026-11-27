// forkguard host: is this computer affected? A read-only look at the places this malware leaves
// traces on a computer. Nothing is deleted, killed or run, and no secret is ever opened: for passwords
// and keys it only notes that the file exists.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BAD_PACKAGES } from './rules.js';
import { checkNpm, scan } from './scan.js';

// Folders in the home directory that hold the loader or its tools (public reports and what was found on infected computers).
export const HIDDEN_DIRS = [
  { name: '.node_modules', level: 'high', why: 'Hidden folder where the loader keeps its own node packages. Normal projects never have one in your home folder' },
  { name: '.n2', level: 'medium', why: 'Folder name a public report lists for the malware' },
  { name: '.npl', level: 'medium', why: 'Folder name a public report lists for the malware' },
  { name: '.pyp', level: 'medium', why: 'Folder name a public report lists for the malware' },
  { name: '.sysinfo', level: 'medium', why: 'Folder name a public report lists for the malware' },
  { name: '.nlp', level: 'medium', why: 'Folder name a public report lists for the malware' },
];

// A command that runs the loader, as it shows up in a process list, a startup file or shell history.
export const RUNNING_RE = /\bnode(?:\.exe)?["']?\s+(?:\S*[\\/])?(?:init|service)(?=\s|$)|\bnode(?:\.exe)?["']?\s+\S*\.(?:woff2?|ttf|otf|eot|ttc)\b|\.npm-ws|[\\/]\.node_modules[\\/]/;
// A startup entry or shell profile line that downloads and runs something, or starts a hidden node process.
export const AUTORUN_RE = /(?:curl|wget)\s[^\n|]*\|\s*(?:ba|z)?sh\b|base64\s+(?:-d|--decode)|\bnode(?:\.exe)?\s+-e\b|nohup\s+node\b|Start-Process\s+node\b|powershell[^\n]*\s-enc\w*\s|\.npm-ws|[\\/]\.node_modules[\\/]/i;

const TEMP_NAMES = new Set(['config.bat', 'temp_auto_push.bat']);

const safeRead = (file, max = 2 * 1024 * 1024) => {
  try {
    if (statSync(file).size > max) return null;
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};
const list = (dir) => {
  try { return readdirSync(dir); } catch { return []; }
};
const defaultRun = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return '';
  }
};

/** The first match of a pattern in `text`, shortened, or null. Never returns the whole line, which may hold a secret. */
function firstMatch(re, text) {
  const m = re.exec(text);
  return m ? m[0].replace(/\s+/g, ' ').slice(0, 80) : null;
}

/** Everything in the home folder named like the loader's own files. */
function loaderFiles(home) {
  const found = [];
  for (const name of list(home)) if (/^\.npm-ws/.test(name)) found.push(path.join(home, name));
  for (const sub of ['.node_modules']) {
    for (const name of list(path.join(home, sub))) if (/^\.npm-ws/.test(name)) found.push(path.join(home, sub, name));
  }
  return found;
}

function processList(platform, run) {
  if (platform === 'win32') {
    const out = run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }']);
    return out.split(/\r?\n/).filter(Boolean);
  }
  return run('ps', ['-axo', 'pid=,command=']).split('\n').filter(Boolean);
}

function startupFiles(home, platform, run) {
  const files = [];
  const dirs = platform === 'darwin'
    ? [path.join(home, 'Library/LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons']
    : platform === 'linux'
      ? [path.join(home, '.config/systemd/user'), path.join(home, '.config/autostart')]
      : [path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'Microsoft/Windows/Start Menu/Programs/Startup')];
  for (const d of dirs) for (const n of list(d)) files.push(path.join(d, n));
  const extra = [];
  if (platform !== 'win32') extra.push({ name: 'crontab', text: run('crontab', ['-l']) });
  else extra.push({ name: 'Run keys', text: run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run']) });
  return { files, extra };
}

const PROFILES = ['.zshrc', '.zprofile', '.zshenv', '.zlogin', '.bashrc', '.bash_profile', '.profile', '.config/fish/config.fish'];
const HISTORIES = ['.zsh_history', '.bash_history', '.local/share/fish/fish_history'];

function vscodeSettings(home, platform) {
  const base = platform === 'darwin'
    ? path.join(home, 'Library/Application Support/Code/User/settings.json')
    : platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'Code/User/settings.json')
      : path.join(home, '.config/Code/User/settings.json');
  return base;
}

/** Files that hold a login, key or token. Only their existence is noted, they are never opened. */
function exposure(home) {
  const spots = [
    ['npm login (may hold a publish token)', '.npmrc'],
    ['GitHub CLI login', '.config/gh/hosts.yml'],
    ['saved git logins', '.git-credentials'],
    ['network logins', '.netrc'],
    ['AWS keys', '.aws/credentials'],
    ['Docker logins', '.docker/config.json'],
    ['Kubernetes access', '.kube/config'],
    ['Google Cloud logins', '.config/gcloud'],
  ];
  const out = spots.filter(([, p]) => existsSync(path.join(home, p))).map(([what, p]) => ({ what, where: path.join('~', p) }));
  for (const n of list(path.join(home, '.ssh'))) {
    if (/^id_/.test(n) && !n.endsWith('.pub')) out.push({ what: 'SSH private key', where: path.join('~/.ssh', n) });
  }
  return out;
}

/**
 * Looks at this computer. Everything that touches the system can be swapped for a test:
 * `home`, `platform`, `run` (how commands are run) and `projects` (folders to scan for infected projects).
 */
export function hostCheck({ home = os.homedir(), platform = process.platform, run = defaultRun, projects, tmp = [os.tmpdir(), '/tmp', '/var/tmp'] } = {}) {
  const findings = [];
  const add = (level, area, message, where = '') => findings.push({ level, area, message, where });
  const checked = [];

  // 1. Hidden folders and the loader's own files
  checked.push('Hidden loader folders');
  for (const d of HIDDEN_DIRS) {
    if (existsSync(path.join(home, d.name))) add(d.level, 'folder', d.why, path.join('~', d.name));
  }
  for (const f of loaderFiles(home)) add('high', 'folder', 'File the loader uses to run, keep its settings or remember its process', f.replace(home, '~'));

  // 2. Running processes
  checked.push('Running processes');
  const ownPid = String(process.pid);
  for (const line of processList(platform, run)) {
    if (line.trim().startsWith(ownPid + ' ')) continue;
    if (/forkguard/.test(line)) continue;
    const hit = firstMatch(RUNNING_RE, line);
    if (hit) add('high', 'process', 'A node process is running the loader (a hidden file, a font file or the hidden folder)', `${line.trim().split(/\s+/)[0]}: ${hit}`);
  }

  // 3. Things that start by themselves
  checked.push('Startup items and cron');
  const { files, extra } = startupFiles(home, platform, run);
  for (const f of files) {
    const text = safeRead(f);
    const hit = text && firstMatch(AUTORUN_RE, text);
    if (hit) add(/npm-ws|[\\/]\.node_modules/.test(hit) ? 'high' : 'medium', 'startup', 'A startup item downloads and runs code or starts a hidden node process', `${f.replace(home, '~')}: ${hit}`);
  }
  for (const e of extra) {
    const hit = firstMatch(AUTORUN_RE, e.text || '');
    if (hit) add('medium', 'startup', `${e.name} runs something that downloads code or starts a hidden node process`, hit);
  }

  // 4. Shell profiles
  checked.push('Shell profiles');
  for (const p of PROFILES) {
    const file = path.join(home, p);
    const text = safeRead(file);
    const hit = text && firstMatch(AUTORUN_RE, text);
    if (hit) add(/npm-ws|[\\/]\.node_modules/.test(hit) ? 'high' : 'medium', 'profile', 'This file runs every time you open a terminal and it downloads code or starts a hidden node process', `~/${p}: ${hit}`);
  }

  // 5. Shell history
  checked.push('Shell history');
  for (const h of HISTORIES) {
    const text = safeRead(path.join(home, h), 8 * 1024 * 1024);
    const hit = text && firstMatch(RUNNING_RE, text);
    if (hit) add('medium', 'history', 'A command tied to the malware was run from this account', `~/${h}: ${hit}`);
  }

  // 6. Dropped files in temp folders
  checked.push('Temp folders');
  for (const dir of new Set(tmp)) {
    for (const n of list(dir)) {
      if (TEMP_NAMES.has(n.toLowerCase()) || /^\.npm-ws/.test(n) || n.endsWith('.orc')) add('high', 'temp', 'File this malware drops to run or spread', path.join(dir, n));
    }
  }

  // 7. VS Code
  checked.push('VS Code automatic tasks');
  const vs = safeRead(vscodeSettings(home, platform));
  if (vs && /"task\.allowAutomaticTasks"\s*:\s*("on"|true)/.test(vs)) {
    add('medium', 'vscode', 'VS Code runs tasks on its own when you open a folder. Set task.allowAutomaticTasks to "off"', 'VS Code user settings');
  }

  // 8. Global npm packages
  checked.push('Global npm packages');
  const globalRoot = run('npm', ['root', '-g']).trim();
  if (globalRoot) {
    for (const n of list(globalRoot)) if (BAD_PACKAGES.includes(n)) add('high', 'package', `${n} is installed globally and is a known malicious package`, globalRoot);
  }

  // 9. npm itself: an infected npm starts the loader again on every npm command
  checked.push('npm itself');
  for (const f of checkNpm()) add('high', 'npm', f.message, f.file.replace(/^npm on this computer \(|\)$/g, '').replace(home, '~'));

  // 10. Projects on disk
  checked.push('Projects on disk');
  const roots = projects ?? ['Developer', 'Projects', 'code', 'dev', 'src', 'repos', 'workspace', 'Sites'].map((d) => path.join(home, d)).filter(existsSync);
  let projectFiles = 0;
  for (const r of roots) {
    const res = scan(r);
    projectFiles += res.checked;
    for (const f of res.findings.filter((x) => x.level === 'high' && x.rule !== 'npm-infected')) {
      add('high', 'project', `${f.message}`, path.join(r, f.file).replace(home, '~'));
    }
  }

  const hostLevel = findings.filter((f) => f.level === 'high' && f.area !== 'project');
  const verdict = hostLevel.length ? 'likely-infected' : findings.some((f) => f.area === 'project' && f.level === 'high') ? 'projects-infected' : findings.length ? 'look' : 'nothing-found';
  return { platform, home, verdict, findings, checked, projectFiles, exposure: exposure(home) };
}

/** Plain steps for after an infection, in the order that works. */
export const INCIDENT_STEPS = [
  'Use a different, clean device for this. Turn the affected computer off the internet if you can.',
  'GitHub: sign out of every session, revoke every authorized OAuth app and GitHub App, delete every personal access token and unknown SSH key, regenerate your 2FA recovery codes, then change your password. (github.com/settings)',
  'Rotate everything that sat on this computer: npm tokens, cloud and database keys, the values in .env files, and saved browser passwords.',
  'On this computer, sign in to GitHub again only after the steps above: gh auth login.',
  'Clean your repos (forkguard --mine --fix), then check them again an hour later. If something is pushed back, an old token or another computer still has access: forkguard pushes shows who pushed.',
  'Ask everyone who works on your repos to run forkguard on their own computers and to re-clone instead of pulling.',
];

export function printHost(r, { c }) {
  const name = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[r.platform] || r.platform;
  console.log(`${c.bold('forkguard')}  checking this computer (${name}). Read-only: nothing is deleted, stopped or run.\n`);
  const level = (l) => (l === 'high' ? c.red(c.bold('HIGH')) : c.yellow(c.bold('MED ')));
  if (r.findings.length) {
    const sorted = [...r.findings].sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
    for (const f of sorted) console.log(`  ${level(f.level)}  ${f.message}${f.where ? `\n        ${c.dim(f.where)}` : ''}`);
    console.log('');
  }
  const verdictText = {
    'likely-infected': c.red('Likely affected. Something on this computer matches the malware.'),
    'projects-infected': c.yellow('The computer itself looks fine, but some projects on it are infected. Run forkguard fix.'),
    look: c.yellow('Nothing definite, but the items above are worth a look.'),
    'nothing-found': c.green('Nothing found.'),
  }[r.verdict];
  console.log(`  ${verdictText}`);
  console.log(c.dim(`  Checked: ${r.checked.join(', ')}.`));
  console.log(c.dim('  Nothing found only means nothing is there right now. This malware can run once, take what it can and remove itself.'));
  if (r.exposure.length) {
    console.log(`\n  Logins and keys on this computer that it could have read if it ran here (never opened by forkguard):`);
    for (const e of r.exposure) console.log(`    ${e.what}  ${c.dim(e.where)}`);
  }
  if (r.verdict === 'likely-infected' || r.verdict === 'projects-infected') {
    console.log(`\n  What to do, in this order:`);
    INCIDENT_STEPS.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  }
}
