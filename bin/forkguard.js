#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/scan.js';
import { fix } from '../src/fix.js';
import { openPr } from '../src/pr.js';
import { setup } from '../src/setup.js';
import { c, printChanges, printScan } from '../src/report.js';
import { GATED } from '../src/rules.js';
import { isGitRepo, repoRoot } from '../src/git.js';
import { checkMine, checkRemote, parseRemote, printRemote } from '../src/remote.js';

const hasHigh = (r) => (r.branches || []).some((b) => b.findings.some((f) => f.level === 'high'));

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `forkguard ${version}
Catch malware hidden in a repo before you install or run it.

  forkguard [folder]        check a project (default: this folder)
  forkguard <github link>   check a repo on GitHub without downloading its files
  forkguard --mine          check every repo you own on GitHub
  forkguard fix [folder]    remove what it found
  forkguard pr [folder]     remove it on a new branch and open a pull request
                            add --upstream to send the fix to the repo you forked from
  forkguard setup           check automatically before npm install, npm run dev, git clone
                            add --remove to undo

Exit code is 1 when something dangerous is found, so it works in CI too.
Add --json to get the findings as JSON.`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const words = args.filter((a) => !a.startsWith('-'));

async function confirm(q) {
  if (!process.stdin.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim().toLowerCase();
  rl.close();
  return a === 'y' || a === 'yes';
}

function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}

// git clone options that take a value as the next argument
const CLONE_VALUE_FLAGS = new Set(['-b', '--branch', '-o', '--origin', '--depth', '-c', '--config', '--reference',
  '--separate-git-dir', '-j', '--jobs', '-u', '--upload-pack', '--template', '--shallow-since', '--shallow-exclude', '--filter']);

function cloneTarget(rest) {
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') { pos.push(...rest.slice(i + 1)); break; }
    if (a.startsWith('-')) { if (CLONE_VALUE_FLAGS.has(a)) i++; continue; }
    pos.push(a);
  }
  if (!pos.length) return null;
  const dir = pos[1] || pos[0].replace(/[/\\]+$/, '').split(/[/\\:]/).pop().replace(/\.git$/, '');
  return path.resolve(dir);
}

/** Called by the shell hooks from `forkguard setup`. Exit 1 stops the package manager. */
async function gate(tool, rest) {
  if (process.env.FORKGUARD_SKIP === '1' || !GATED[tool]) return 0;
  const sub = rest.find((a) => !a.startsWith('-')) ?? '';
  if (!GATED[tool].has(sub)) return 0;

  let dir;
  if (tool === 'git') dir = sub === 'clone' ? cloneTarget(rest.slice(rest.indexOf('clone') + 1)) : repoRoot(process.cwd());
  else dir = findProjectRoot(process.cwd());
  if (!dir || !existsSync(dir)) return 0;

  const result = scan(dir);
  const high = result.findings.some((f) => f.level === 'high');
  if (!result.findings.length) return 0;
  if (!high) {
    console.error(c.yellow(`forkguard: ${result.findings.length} thing(s) worth a look in ${path.basename(dir)}. Run "forkguard" for details.`));
    return 0;
  }
  printScan(result);
  if (tool === 'git') {
    console.error(`\n  ${c.red('The code you just pulled in is infected.')} Clean it before you open or install it.`);
    return 0;
  }
  const powershell = process.platform === 'win32' && !process.env.MSYSTEM && !process.env.SHELL;
  console.error(`\n  ${c.red(`Stopped "${tool} ${sub}" so nothing in this project runs.`)}\n  To run it anyway: ${powershell ? "$env:FORKGUARD_SKIP='1'; " : 'FORKGUARD_SKIP=1 '}${tool} ${rest.join(' ')}`);
  return 1;
}

async function main() {
  // Gate mode first: the arguments belong to npm or git, not to forkguard.
  if (args[0] === '--gate') return gate(args[1], args.slice(2));
  if (flags.has('--help') || flags.has('-h') || words[0] === 'help') return console.log(HELP), 0;
  if (flags.has('--version') || flags.has('-v')) return console.log(version), 0;

  if (flags.has('--mine')) {
    const results = await checkMine({ json: flags.has('--json') });
    if (flags.has('--json')) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      const flagged = results.filter((r) => r.error || (r.branches || []).some((b) => b.findings.length));
      const infected = results.filter(hasHigh).length;
      console.log(`\n  ${results.length} repos checked: ${c.green(`${results.length - flagged.length} clean`)}, ${infected ? c.red(`${infected} infected`) : '0 infected'}\n`);
      for (const r of flagged) { printRemote(r); console.log(''); }
    }
    return results.some(hasHigh) ? 1 : 0;
  }

  const [cmd, folder] = ['fix', 'pr', 'setup'].includes(words[0]) ? [words[0], words[1]] : ['scan', words[0]];

  const remote = parseRemote(folder);
  if (remote && cmd === 'scan') {
    if (!flags.has('--json')) console.log(c.dim(`  checking ${remote.name} on GitHub, every branch, without writing its files...\n`));
    const result = await checkRemote(remote);
    if (flags.has('--json')) console.log(JSON.stringify(result, null, 2));
    else printRemote(result);
    if (result.error) return 2;
    return hasHigh(result) ? 1 : 0;
  }
  if (remote) throw new Error(`"forkguard ${cmd}" works on a folder. Clone the repo first, then run it inside the folder.`);

  const target = path.resolve(folder || '.');

  if (cmd === 'setup') {
    await setup({ remove: flags.has('--remove') });
    return 0;
  }

  if (cmd === 'pr') {
    await openPr(target, { upstream: flags.has('--upstream') });
    return 0;
  }

  const result = scan(target);

  if (cmd === 'scan') {
    if (flags.has('--json')) console.log(JSON.stringify({ root: result.root, checked: result.checked, findings: result.findings }, null, 2));
    else printScan(result);
    return result.findings.some((f) => f.level === 'high') ? 1 : 0;
  }

  // fix
  if (!result.findings.some((f) => f.fix)) {
    printScan(result);
    if (!result.findings.length) return 0;
    console.log('\n  None of these can be fixed automatically. Check them by hand.');
    return 1;
  }
  if (!isGitRepo(target) && !(await confirm(`  ${path.basename(target)} is not a git repo, so these changes cannot be undone. Continue? (y/N) `))) return 1;

  console.log(`${c.bold('forkguard')}  cleaning ${path.basename(result.root)}\n`);
  printChanges(fix(result));
  const after = scan(target);
  if (!after.findings.length) {
    console.log(`\n  ${c.green('Clean now.')} ${isGitRepo(target) ? 'Review with "git diff", then commit.' : ''}`);
    return 0;
  }
  console.log(`\n  Still needs a look:\n`);
  for (const f of after.findings) console.log(`  ${f.level === 'high' ? c.red('HIGH') : c.yellow('MED ')}  ${f.file}  ${f.message}`);
  if (after.findings.some((f) => f.rule === 'secret')) console.log(`\n  Committed .env files stay on disk. "forkguard pr" takes them out of git for you.`);
  return after.findings.some((f) => f.level === 'high') ? 1 : 0;
}

main().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    console.error(`${c.red('forkguard')}  ${err.message}`);
    process.exit(2);
  },
);
