#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/scan.js';
import { fix, projectsOf } from '../src/fix.js';
import { openPr } from '../src/pr.js';
import { setup } from '../src/setup.js';
import { agent } from '../src/agent.js';
import { c, printChanges, printScan } from '../src/report.js';
import { GATED } from '../src/rules.js';
import { isGitRepo, repoRoot } from '../src/git.js';
import { checkMine, checkRemote, checkUser, parseRemote, parseUser, printRemote } from '../src/remote.js';
import { getToken, guessUsernames, loginHelp } from '../src/auth.js';
import { openFixPrs, planFixes } from '../src/githubfix.js';
import { aiSetupHelp, isBlocked, parseSkillSource, planAi, resolveProvider, reviewSkills, parseSkillsInstall, printSkill, scanSkills, scanSource, skillsExitCode, skillsJson, standardSkillRoots, strictMode, verdictOf } from '../src/skills/index.js';

const hasHigh = (r) => (r.branches || []).some((b) => b.findings.some((f) => f.level === 'high'));

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `forkguard ${version}
Finds the PolinRider malware in your code and removes it.

Most people only need these:

  forkguard            Check this folder, and every project inside it
  forkguard fix        Clean everything it found
  forkguard --mine     Check your GitHub repos. If you are not logged in, it checks
                       your public ones and shows you how to log in for the rest.
                       Add --fix to open a pull request for each infected repo.

Other things it can do:

  forkguard owner/repo     Check one GitHub repo without downloading it
  forkguard @name          Check someone else's public repos
  forkguard pr             Clean this repo on a new branch and open a pull request
                           (add --upstream to send it to the repo you forked from)
  forkguard skills         Check the AI agent skills on this computer (Claude Code, Codex, Cursor...)
                           (or one skill folder, or owner/repo before you install it)
                           (add --ai for an AI review. You bring your own API key, set as an
                           environment variable, for example: export ANTHROPIC_API_KEY=...)
  forkguard setup          Check automatically before npm install, git clone and npx skills add
                           (add --remove to undo)
  forkguard agent          Print safety rules for AI coding agents
                           (add --write to save them in AGENTS.md, CLAUDE.md and more)

Exit code 1 means something dangerous was found, so it works in CI too.
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

async function ask(q) {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim();
  rl.close();
  return a;
}

/** Reads a secret without echoing it, for this run only. */
async function askSecret(q) {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (text) => { if (!muted) write(text); };
  const pending = rl.question(q);
  muted = true;
  const answer = await pending;
  rl.close();
  process.stdout.write('\n');
  return answer.trim();
}

/**
 * Runs SkillSpector's AI review on scanned skills. The user brings the key (environment variable, or pasted for this run).
 * Returns null when the review ran, or an exit code when it could not start.
 */
async function aiReview(results, { yes = false, json = false } = {}) {
  let provider = resolveProvider();
  if (provider.error && process.stdin.isTTY && !json && (provider.error === 'no-provider' || provider.error === 'no-key')) {
    console.log(`${c.bold('forkguard')}  The AI review needs an API key, and none is set.\n`);
    const pasted = await askSecret('  Paste an Anthropic or OpenAI API key (hidden, used for this run only, never saved), or press Enter for other ways: ');
    if (pasted) provider = resolveProvider(process.env, { provider: pasted.startsWith('sk-ant-') ? 'anthropic' : 'openai', key: pasted });
  }
  if (provider.error) {
    const why = { 'no-provider': 'No AI provider is set up.', 'no-key': `No ${provider.provider} API key is set.`, 'no-base-url': 'No base URL is set for the local model.', 'no-model': 'No model name is set for the local model (FORKGUARD_AI_MODEL).', 'unknown-provider': `Unknown AI provider "${provider.provider}". Use anthropic, openai or ollama.` }[provider.error];
    console.error(`${c.red('forkguard')}  ${why}\n\n${aiSetupHelp()}`);
    return 2;
  }
  const plan = planAi(results);
  if (!plan.requests) { if (!json) console.log(c.dim('  Nothing to send to the AI review.\n')); return null; }
  if (!json) {
    const where = provider.local ? `${provider.label}, on your own computer, so nothing leaves it` : `${provider.label} (${provider.model})`;
    console.log(`${c.bold('forkguard')}  AI review\n`);
    console.log(`  It will send the text of ${plan.files} file${plan.files === 1 ? '' : 's'} from ${plan.skills} skill${plan.skills === 1 ? '' : 's'} to ${where}: ${plan.requests} request${plan.requests === 1 ? '' : 's'}, about ${Math.ceil(plan.inputTokens / 1000)}k tokens in.`);
    console.log('  Keys, tokens and .env values are hidden first. You pay your provider for the tokens.');
    if (plan.skipped) console.log(`  ${plan.skipped} file${plan.skipped === 1 ? '' : 's'} are over the size limit and will not be sent.`);
    console.log('');
  }
  if (!yes) {
    if (!process.stdin.isTTY) { console.error(`${c.red('forkguard')}  Not sending anything without your yes. Add --yes to allow it.`); return 2; }
    if (!(await confirm('  Send it? (y/N) '))) { console.log('\n  Okay, nothing was sent. The offline result follows.\n'); return null; }
    console.log('');
  }
  const summary = await reviewSkills(results, provider, { onProgress: () => { if (!json && process.stderr.isTTY) process.stderr.write('.'); } });
  if (!json && process.stderr.isTTY) process.stderr.write('\n');
  if (summary.failed && !json) {
    console.log(c.yellow(`  ${summary.failed} of ${summary.requests} requests failed (${summary.errors.join('; ')}). Those parts keep their offline result.\n`));
  }
  return null;
}

function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null; // not inside a project, so nothing to protect
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

// Package manager options that take their value as the next argument, so that value is not mistaken for the subcommand.
const PM_VALUE_FLAGS = new Set(['--prefix', '-C', '--dir', '--cwd', '-w', '--workspace', '-F', '--filter', '--registry',
  '--loglevel', '--userconfig', '--cache', '--tag', '--otp']);
// The ones that also say which project the command runs in.
const PM_DIR_FLAGS = new Set(['--prefix', '-C', '--dir', '--cwd']);

/** Finds the real subcommand and the project folder the package manager was pointed at, if any. */
function parsePm(rest) {
  let sub = null;
  let dir = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const [flag, inline] = a.startsWith('--') ? a.split(/=(.*)/s) : [a, undefined];
    if (a.startsWith('-')) {
      const value = inline ?? (PM_VALUE_FLAGS.has(flag) ? rest[++i] : undefined);
      if (PM_DIR_FLAGS.has(flag) && value) dir = path.resolve(value);
      continue;
    }
    if (sub === null) sub = a;
  }
  return { sub: sub ?? '', dir };
}

/** Called by the shell hooks from `forkguard setup`. Exit 1 stops the package manager. */
async function gate(tool, rest) {
  if (process.env.FORKGUARD_SKIP === '1') return 0;
  const install = parseSkillsInstall(tool, rest);
  if (install) return skillsGate(install, tool, rest);
  if (!GATED[tool]) return 0;
  const parsed = tool === 'git' ? { sub: rest.find((a) => !a.startsWith('-')) ?? '', dir: null } : parsePm(rest);
  const sub = parsed.sub;
  if (!GATED[tool].has(sub)) return 0;
  // A global install runs that package's own scripts, not the project you happen to be standing in.
  if (tool !== 'git' && rest.some((a) => a === '-g' || a === '--global' || a === '--location=global')) return 0;

  let dir;
  if (tool === 'git') dir = sub === 'clone' ? cloneTarget(rest.slice(rest.indexOf('clone') + 1)) : repoRoot(process.cwd());
  else dir = findProjectRoot(parsed.dir ?? process.cwd());
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

/** Stops `npx skills add <source>` when the skill is dangerous. Checks the source first, before anything is installed. */
async function skillsGate(install, tool, rest) {
  let blocked = false;
  for (const source of install.sources) {
    if (!parseSkillSource(source)) continue;
    let results;
    try {
      results = await scanSource(source, { only: install.skills });
    } catch (err) {
      console.error(c.yellow(`forkguard: could not check ${source} first (${err.message}). Installing anyway.`));
      continue;
    }
    if (!results.length) { console.error(c.yellow(`forkguard: no SKILL.md found in ${source}, so there was nothing to check.`)); continue; }
    const strict = strictMode(flags);
    if (process.env.FORKGUARD_AI === '1') {
      const provider = resolveProvider();
      if (provider.error) console.error(c.yellow('forkguard: FORKGUARD_AI=1 is set but no AI key is, so only the offline check ran.'));
      else await reviewSkills(results, provider);
    }
    const bad = results.filter((r) => isBlocked(r, strict));
    const odd = results.filter((r) => !isBlocked(r, strict) && r.score > 20);
    if (bad.length) {
      console.error(`${c.bold('forkguard')}  checked ${source} before installing it\n`);
      for (const r of bad) printSkill(r, { limit: 6, strict });
      blocked = true;
    } else if (odd.length) {
      console.error(c.yellow(`forkguard: ${odd.map((r) => r.name).join(', ')} from ${source} is worth a look. Run "forkguard skills ${source}" for details.`));
    }
  }
  if (!blocked) return 0;
  const powershell = process.platform === 'win32' && !process.env.MSYSTEM && !process.env.SHELL;
  console.error(`\n  ${c.red('Stopped the install, so nothing was added to your agent.')}\n  To install it anyway: ${powershell ? "$env:FORKGUARD_SKIP='1'; " : 'FORKGUARD_SKIP=1 '}${tool} ${rest.join(' ')}`);
  return 1;
}

/** forkguard skills: checks installed skills, one skill folder, or a source you have not installed yet. */
async function skillsCommand(target) {
  const json = flags.has('--json');
  const strict = strictMode(flags);
  let results;
  if (target) {
    const source = parseSkillSource(target);
    if (!source) throw new Error(`Not a folder or a skill source: ${target}`);
    if (!json) console.log(c.dim(`  checking ${source.kind === 'local' ? target : source.name}${source.kind === 'git' ? ', downloading it to a temporary folder' : ''}...\n`));
    results = await scanSource(source);
  } else {
    const roots = standardSkillRoots();
    results = scanSkills(roots, { label: (p) => p.replace(process.env.HOME || '~', '~') });
    if (!roots.length && !json) {
      console.log('  No skills found in the folders any supported AI agent uses (~/.claude/skills, ~/.agents/skills, .claude/skills and so on).');
      console.log('  To check a skill before you install it:  forkguard skills owner/repo');
      return 0;
    }
  }
  if (flags.has('--ai') && results.length) {
    const code = await aiReview(results, { yes: flags.has('--yes') || flags.has('-y'), json });
    if (code !== null) return code;
  }
  if (json) { console.log(JSON.stringify(skillsJson(results, strict), null, 2)); return skillsExitCode(results, strict); }
  if (!results.length) { console.log('  No skills found there. A skill is a folder with a SKILL.md file in it.'); return 0; }
  const worst = results.slice().sort((a, b) => b.score - a.score);
  const bad = results.filter((r) => isBlocked(r, strict)).length;
  const odd = results.filter((r) => !isBlocked(r, strict) && r.score > 20).length;
  console.log(`  ${results.length} skill${results.length === 1 ? '' : 's'} checked: ${c.green(`${results.length - bad - odd} fine`)}, ${odd ? c.yellow(`${odd} worth a look`) : '0 worth a look'}, ${bad ? c.red(`${bad} to avoid`) : '0 to avoid'}\n`);
  for (const r of worst) { if (r.score > 0 || flags.has('--all')) { printSkill(r, { all: flags.has('--all'), strict }); console.log(''); } }
  if (!worst.some((r) => r.score > 0)) console.log(c.dim('  Nothing to report.\n'));
  console.log(c.dim('  This is a first check with SkillSpector\'s rules, run offline. See docs/skills.md for what it does not cover.'));
  return skillsExitCode(results, strict);
}

/** The GitHub checks: --mine, and @name. Never asks for a login just to look. */
async function github(user) {
  const json = flags.has('--json');
  const token = getToken();
  const mine = !user;
  let name = user;
  let publicOnly = false;

  if (mine && !token) {
    if (flags.has('--fix')) {
      console.error(`${c.bold('forkguard')}  To open pull requests, forkguard has to log in to GitHub first. Here is how:\n\n${loginHelp()}\n\n  Then run: forkguard --mine --fix`);
      return 2;
    }
    publicOnly = true;
    const guesses = guessUsernames();
    name = guesses[0];
    if (!json && process.stdin.isTTY) {
      console.log(`${c.bold('forkguard')}  You are not logged in to GitHub, so forkguard will check your ${c.bold('public')} repos.\n  (Log in and it can check the private ones too.)\n`);
      name = (await ask(`  Which GitHub account? ${name ? `[${name}] ` : '(your username, as in github.com/username) '}`)) || name;
      console.log('');
    }
    if (!name) {
      throw new Error(`Which GitHub account should it check? Run: forkguard @your-username\n\n  Or log in, and it will find your account by itself:\n\n${loginHelp()}`);
    }
  }

  const results = mine && !publicOnly ? await checkMine({ json }) : await checkUser(name, { json });
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return results.some(hasHigh) ? 1 : 0;
  }

  const flagged = results.filter((r) => r.error || (r.branches || []).some((b) => b.findings.length));
  const infected = results.filter(hasHigh);
  console.log(`\n  ${results.length} repos checked: ${c.green(`${results.length - flagged.length} clean`)}, ${infected.length ? c.red(`${infected.length} infected`) : '0 infected'}\n`);
  for (const r of flagged) { printRemote(r); console.log(''); }

  const { targets, sideBranches } = planFixes(results);
  if (mine && flags.has('--fix') && token) {
    if (!targets.length) {
      console.log('  Nothing to fix. No repo has malware on its main branch.');
    } else {
      console.log(`  forkguard will open ${targets.length} pull request${targets.length === 1 ? '' : 's'}, one per infected repo. Nothing changes until you merge them:\n`);
      for (const r of targets) console.log(`    ${r.name}`);
      const yes = flags.has('--yes') || flags.has('-y') || (process.stdin.isTTY && (await ask('\n  Go ahead? (y/N) ')).toLowerCase().startsWith('y'));
      if (!yes) {
        console.log(flags.has('--yes') || process.stdin.isTTY ? '\n  Okay, nothing was changed.' : '\n  Nothing was changed. Add --yes to open them without being asked.');
      } else {
        const opened = await openFixPrs(targets, token);
        const links = opened.filter((o) => o.url);
        console.log(`\n  ${links.length} pull request${links.length === 1 ? '' : 's'} opened.`);
        for (const o of links) console.log(`    ${o.url}`);
      }
    }
  } else if (targets.length) {
    console.log(`  ${targets.length} repo${targets.length === 1 ? ' is' : 's are'} infected on the main branch. forkguard can fix ${targets.length === 1 ? 'it' : 'them'}: it opens a pull request for each one, so nothing changes until you merge.`);
    if (mine && token) console.log('  To do that, run:\n\n    forkguard --mine --fix\n');
    else if (mine) console.log(`  To do that it has to log in to GitHub first. Here is how:\n\n${loginHelp()}\n\n  Then run:\n\n    forkguard --mine --fix\n`);
    else console.log(`  Only the owner can fix them: from their computer, ${c.bold('forkguard --mine --fix')}.\n`);
  }
  if (sideBranches.length) {
    console.log('  Also infected on side branches (check these yourself, they get no pull request):');
    for (const s of sideBranches) console.log(`    ${s.name}: ${s.branches.join(', ')}`);
    console.log('');
  }
  if (publicOnly && !targets.length) console.log('  Private repos were not checked. To include them, log in and run forkguard --mine again.\n');
  return infected.length ? 1 : 0;
}

async function main() {
  // Gate mode first: the arguments belong to npm or git, not to forkguard.
  if (args[0] === '--gate') return gate(args[1], args.slice(2));
  if (flags.has('--help') || flags.has('-h') || words[0] === 'help') return console.log(HELP), 0;
  if (flags.has('--version') || flags.has('-v')) return console.log(version), 0;

  const user = flags.has('--mine') ? null : parseUser(words[0]);
  if (flags.has('--mine') || (user && !existsSync(words[0]))) return github(user);

  if (words[0] === 'skills') return skillsCommand(words[1]);

  const [cmd, folder] = ['fix', 'pr', 'setup', 'agent'].includes(words[0]) ? [words[0], words[1]] : ['scan', words[0]];

  const remote = parseRemote(folder);
  if (remote && cmd === 'scan') {
    if (!flags.has('--json')) console.log(c.dim(`  checking ${remote.name} on GitHub, every branch, without writing its files...\n`));
    const result = await checkRemote(remote);
    if (flags.has('--json')) console.log(JSON.stringify(result, null, 2));
    else printRemote(result);
    if (result.error) return 2;
    return hasHigh(result) ? 1 : 0;
  }
  if (remote) {
    if (/^[\w.-]+\/[\w.-]+$/.test(folder)) throw new Error(`No such folder: ${folder}`);
    throw new Error(`"forkguard ${cmd}" works on a folder. Clone the repo first, then run it inside the folder.`);
  }

  const target = path.resolve(folder || '.');

  if (cmd === 'agent') {
    agent(folder ? target : process.cwd(), { write: flags.has('--write') });
    return 0;
  }

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
  const projects = projectsOf(result);
  const outside = projects.delete('(not in a git repo)');
  if (outside && !(await confirm(`  Some of these files are not in a git repo, so those changes cannot be undone. Continue? (y/N) `))) return 1;
  const fixable = new Set(result.findings.filter((f) => f.fix && f.fix !== 'ignore-env').map((f) => f.file)).size;
  if (projects.size > 1 && !flags.has('--yes') && !flags.has('-y') && !(await confirm(`  This will clean ${fixable} files in ${projects.size} projects under ${path.basename(result.root)}. Continue? (y/N) `))) return 1;

  console.log(`${c.bold('forkguard')}  cleaning ${path.basename(result.root)}\n`);
  const changes = fix(result);
  printChanges(changes);
  if (projects.size > 1) console.log(`\n  Cleaned ${changes.filter((x) => !x.failed).length} files in ${projects.size} projects.`);
  const after = scan(target);
  if (!after.findings.length) {
    console.log(`\n  ${c.green('Clean now.')} ${projects.size > 1 ? 'Review each project with "git diff", then commit.' : isGitRepo(target) ? 'Review with "git diff", then commit.' : ''}`);
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
