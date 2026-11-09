import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { c } from './report.js';
import { hasCommand, run } from './git.js';

const START = '# >>> forkguard >>>';
const END = '# <<< forkguard <<<';

const POWERSHELL = `${START}
# Checks a project before npm, pnpm, yarn or bun installs or runs it, and after git clone or pull.
# Skip once with: $env:FORKGUARD_SKIP = '1'
function __fg_real([string]$name) {
  (Get-Command $name -CommandType Application -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.exe', '.cmd', '.bat' } | Select-Object -First 1).Source
}
function __fg_pm([string]$tool, [object[]]$rest) {
  forkguard --gate $tool @rest
  if ($LASTEXITCODE -ne 0) { return }
  & (__fg_real $tool) @rest
}
function npm  { __fg_pm npm  $args }
function pnpm { __fg_pm pnpm $args }
function yarn { __fg_pm yarn $args }
function bun  { __fg_pm bun  $args }
function git {
  & (__fg_real git) @args
  $code = $LASTEXITCODE
  if ($code -eq 0 -and $args.Count -gt 0 -and @('clone', 'pull', 'merge', 'checkout', 'switch') -contains $args[0]) {
    forkguard --gate git @args
  }
  $global:LASTEXITCODE = $code
}
${END}`;

const POSIX = `${START}
# Checks a project before npm, pnpm, yarn or bun installs or runs it, and after git clone or pull.
# Skip once with: FORKGUARD_SKIP=1 npm install
npm()  { forkguard --gate npm "$@"  && command npm "$@"; }
pnpm() { forkguard --gate pnpm "$@" && command pnpm "$@"; }
yarn() { forkguard --gate yarn "$@" && command yarn "$@"; }
bun()  { forkguard --gate bun "$@"  && command bun "$@"; }
git() {
  command git "$@"
  local code=$?
  if [ $code -eq 0 ]; then
    case " clone pull merge checkout switch " in *" $1 "*) forkguard --gate git "$@" ;; esac
  fi
  return $code
}
${END}`;

function removeBlock(text) {
  const re = new RegExp(`\\r?\\n?${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n?`, 'g');
  return text.replace(re, '\n').replace(/\n{3,}$/, '\n');
}

function safeMkdirSync(dir) {
  if (existsSync(dir)) return;
  if (process.platform === 'win32') {
    const script = `const fs = require('fs'); fs.mkdirSync(${JSON.stringify(dir)}, { recursive: true });`;
    const res = spawnSync(process.execPath, ['-e', script], { timeout: 1000 });
    if (res.error?.code === 'ETIMEDOUT' || res.status !== 0) {
      throw new Error('Blocked by Windows Defender or permission denied');
    }
    return;
  }
  mkdirSync(dir, { recursive: true });
}

function safeWriteFileSync(file, content) {
  if (process.platform === 'win32') {
    const b64 = Buffer.from(content, 'utf8').toString('base64');
    const script = `const fs = require('fs'); fs.writeFileSync(${JSON.stringify(file)}, Buffer.from(${JSON.stringify(b64)}, 'base64'));`;
    const res = spawnSync(process.execPath, ['-e', script], { timeout: 1000 });
    if (res.error?.code === 'ETIMEDOUT' || res.status !== 0) {
      throw new Error('Blocked by Windows Defender or permission denied');
    }
    return;
  }
  writeFileSync(file, content);
}

function writeBlock(file, block) {
  safeMkdirSync(path.dirname(file));
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const cleaned = removeBlock(before);
  const next = block ? `${cleaned.replace(/\s*$/, '')}${cleaned.trim() ? '\n\n' : ''}${block}\n` : cleaned;
  if (next !== before) safeWriteFileSync(file, next);
  return next !== before;
}

function profiles() {
  const home = homedir();
  const list = [];
  if (process.platform === 'win32') {
    let docs = path.join(home, 'Documents');
    try { docs = run('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"]) || docs; } catch { /* keep default */ }
    list.push({ file: path.join(docs, 'WindowsPowerShell', 'profile.ps1'), block: POWERSHELL, name: 'Windows PowerShell' });
    if (hasCommand('pwsh')) list.push({ file: path.join(docs, 'PowerShell', 'profile.ps1'), block: POWERSHELL, name: 'PowerShell 7' });
    if (existsSync(path.join(home, '.bashrc')) || hasCommand('bash')) list.push({ file: path.join(home, '.bashrc'), block: POSIX, name: 'Git Bash' });
  } else {
    const shell = path.basename(process.env.SHELL || '');
    for (const [rc, sh] of [['.zshrc', 'zsh'], ['.bashrc', 'bash']]) {
      const file = path.join(home, rc);
      if (existsSync(file) || shell === sh) list.push({ file, block: POSIX, name: sh });
    }
  }
  return list;
}

function vscodeSettingsFile() {
  const home = homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  return path.join(home, '.config', 'Code', 'User', 'settings.json');
}

function turnOffVsCodeAutoTasks() {
  const file = vscodeSettingsFile();
  if (!existsSync(path.dirname(file))) return 'VS Code not found';
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '{\n}\n';
  if (/"task\.allowAutomaticTasks"\s*:\s*"off"/.test(text)) return 'already off';
  let next;
  if (/"task\.allowAutomaticTasks"/.test(text)) {
    next = text.replace(/("task\.allowAutomaticTasks"\s*:\s*)("[^"]*"|true|false)/, '$1"off"');
  } else if (/^\s*\{\s*\}\s*$/.test(text)) {
    next = '{\n  "task.allowAutomaticTasks": "off"\n}\n';
  } else if (/^\s*\{/.test(text)) {
    next = text.replace(/^\s*\{/, '{\n  "task.allowAutomaticTasks": "off",');
  } else {
    return 'could not edit settings.json, set "task.allowAutomaticTasks": "off" by hand';
  }
  writeFileSync(file, next);
  return 'turned off';
}

async function ask(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === '' || answer === 'y' || answer === 'yes';
}

export async function setup({ remove = false, print = false } = {}) {
  if (print) {
    console.log(process.platform === 'win32' ? POWERSHELL : POSIX);
    return;
  }

  const runningFromNpx = /[\\/]_npx[\\/]/.test(process.argv[1] || '');
  if (!remove && (runningFromNpx || !hasCommand('forkguard'))) {
    console.log(`${c.yellow('forkguard')}  Install it globally first so your shell can find it:\n\n    npm install -g forkguard\n\n  Then run ${c.cyan('forkguard setup')} again.`);
    return;
  }

  console.log(`${c.bold('forkguard')}  ${remove ? 'removing automatic checks' : 'setting up automatic checks'}\n`);
  const failed = [];
  for (const p of profiles()) {
    try {
      const changed = writeBlock(p.file, remove ? null : p.block);
      console.log(`  ${c.green('done')}  ${p.name.padEnd(20)}${c.dim(p.file)}${changed ? '' : c.dim('  (no change)')}`);
    } catch {
      console.log(`  ${c.red('fail')}  ${p.name.padEnd(20)}${c.dim(p.file)}  ${c.yellow('(blocked by Windows Defender or permissions)')}`);
      failed.push(p);
    }
  }

  if (remove) {
    if (failed.length) {
      console.log(`\n  ${c.yellow('Note:')} Could not remove hook automatically due to permissions.`);
      console.log(`  To remove manually, open your profile with ${c.cyan('notepad $PROFILE')} and delete the forkguard block.`);
    } else {
      console.log('\n  Open a new terminal and forkguard will no longer run on its own.');
    }
    return;
  }

  if (failed.length) {
    console.log(`\n  ${c.yellow('Windows Defender (Controlled Folder Access)')} blocked editing your Documents folder.`);
    console.log(`  You do not need to change Windows Defender settings. To finish setup:\n`);
    console.log(`  1. In PowerShell, open your profile:`);
    console.log(`       ${c.cyan('notepad $PROFILE')}`);
    console.log(`  2. Paste this block at the bottom and save:\n`);
    console.log(c.dim(POWERSHELL));
    console.log(`\n  Tip: You can also print this block anytime with: ${c.cyan('forkguard setup --print')}\n`);
  } else {
    console.log(`\n  From a new terminal, forkguard now checks a project before:`);
    console.log('    npm, pnpm, yarn or bun install / run / dev / start / build / test');
    console.log('    and right after git clone, pull, merge, checkout or switch');
    console.log(`  If it finds something dangerous, the command is stopped before anything runs.\n`);
  }

  if (await ask('  Also stop VS Code from running tasks by itself when you open a folder? (Y/n) ')) {
    console.log(`  ${c.green('done')}  VS Code automatic tasks: ${turnOffVsCodeAutoTasks()}`);
  } else if (!process.stdin.isTTY) {
    console.log(`  Tip: set "task.allowAutomaticTasks": "off" in your VS Code settings. That is how this malware starts.`);
  }
}
export const HOOKS = { POWERSHELL, POSIX };
