// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Checking AI agent skills. The rules are SkillSpector's (NVIDIA, Apache-2.0), translated to JavaScript.
// See NOTICE for the credit and docs/skills.md for what is and is not covered.
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { scanFiles, scanSkillFolder } from './scan.js';
import { c } from '../report.js';
import { globalSkillDirs, projectSkillDirs } from './agents.js';
export { planAi, reviewSkills } from './ai/review.js';
export { resolveProvider, aiSetupHelp } from './ai/providers.js';

export { scanFiles, scanSkillFolder };

const NO_HOOKS = ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`];
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/**
 * The folders where AI agents keep skills: every agent the skills CLI supports (79 of them), in your home folder
 * and in this project. Most share a few folders, so this is about 100 places to look and only the ones that exist are returned.
 */
export function standardSkillRoots(cwd = process.cwd()) {
  const roots = [
    ...globalSkillDirs().map((rel) => path.join(homedir(), rel)),
    ...projectSkillDirs().map((rel) => path.join(cwd, rel)),
    path.join(cwd, 'skills'),
  ];
  return [...new Set(roots)].filter(isDir);
}

/**
 * Every folder under `root` that holds a SKILL.md, including `root` itself.
 * A symlinked skill folder is followed, because that is how the skills CLI installs by default (one copy, linked
 * into each agent). Each real folder is reported once. Symlinks inside a skill are never followed.
 */
export function findSkills(root, maxDepth = 5) {
  const found = [];
  const seen = new Set();
  const walk = (dir, depth) => {
    const here = real(dir);
    if (seen.has(here)) return;
    seen.add(here);
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name.toLowerCase() === 'skill.md')) { found.push(dir); return; }
    if (depth >= maxDepth) return;
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory() || (e.isSymbolicLink() && isDir(full))) walk(full, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/** Scans every skill under the given folders. */
export function scanSkills(roots, { label = (p) => p } = {}) {
  const results = [];
  const seen = new Set();
  for (const root of roots) {
    for (const dir of findSkills(root)) {
      const where = real(dir);
      if (seen.has(where)) continue;
      seen.add(where);
      results.push({ name: label(path.resolve(dir)), path: where, ...scanSkillFolder(where) });
    }
  }
  return results;
}

// ------------------------------------------------------------------------------------------ remote sources
/** A skill source as `npx skills add` takes it: owner/repo, owner/repo@skill, a GitHub link, a git URL or a folder. */
export function parseSkillSource(arg) {
  if (!arg) return null;
  if (existsSync(arg)) return { kind: 'local', path: path.resolve(arg) };
  const tree = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/tree\/([^/\s]+)(?:\/(.*?))?\/?$/i.exec(arg);
  if (tree) return { kind: 'git', url: `https://github.com/${tree[1]}/${tree[2]}.git`, name: `${tree[1]}/${tree[2]}`, ref: tree[3], subpath: tree[4] || '' };
  const gh = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(arg);
  if (gh) return { kind: 'git', url: `https://github.com/${gh[1]}/${gh[2]}.git`, name: `${gh[1]}/${gh[2]}`, ref: null, subpath: '' };
  if (/^(https?|ssh|git):\/\//.test(arg) || /^git@[^:]+:/.test(arg)) return { kind: 'git', url: arg, name: arg.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/'), ref: null, subpath: '' };
  const short = /^([\w.-]+)\/([\w.-]+?)(?:@([\w.-]+))?(?:\/(.+))?$/.exec(arg);
  if (short) return { kind: 'git', url: `https://github.com/${short[1]}/${short[2]}.git`, name: `${short[1]}/${short[2]}`, ref: null, subpath: short[4] || '', skill: short[3] || null };
  return null;
}

function cloneSource(src, dir) {
  return new Promise((resolve) => {
    // Skills are read, never run, and repo hooks are switched off. Symlinks are not followed when reading.
    const args = [...NO_HOOKS, '-c', 'core.symlinks=false', 'clone', '--quiet', '--depth', '1', ...(src.ref ? ['--branch', src.ref] : []), src.url, dir];
    const p = spawn('git', args, { env: ENV });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => resolve('git is not installed or not on PATH'));
    p.on('close', (code) => resolve(code === 0 ? null : err.trim().split('\n').pop() || `git clone failed (${code})`));
  });
}

/** Downloads (or points at) a skill source and scans the skills in it. Cleans up after itself. */
export async function scanSource(source, { only = [] } = {}) {
  const src = typeof source === 'string' ? parseSkillSource(source) : source;
  if (!src) throw new Error(`Not a skill source: ${source}`);
  let dir, cleanup = () => {};
  if (src.kind === 'local') dir = src.path;
  else {
    const tmp = mkdtempSync(path.join(tmpdir(), 'forkguard-skill-'));
    cleanup = () => rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    const err = await cloneSource(src, path.join(tmp, 'repo'));
    if (err) { cleanup(); throw new Error(err); }
    dir = path.join(tmp, 'repo');
  }
  try {
    const root = src.subpath ? path.join(dir, src.subpath) : dir;
    if (!existsSync(root)) throw new Error(`${src.subpath} is not in ${src.name}`);
    const wanted = new Set([...only, ...(src.skill ? [src.skill] : [])].map((s) => s.toLowerCase()));
    let results = scanSkills([root], { label: (p) => (p === path.resolve(root) ? src.name || path.basename(p) : path.relative(root, p) || path.basename(p)) });
    if (wanted.size && !wanted.has('*')) results = results.filter((r) => wanted.has(path.basename(r.path).toLowerCase()) || wanted.has(String(r.name).toLowerCase()));
    return results;
  } finally {
    cleanup();
  }
}

// ------------------------------------------------------------------------------------------ guard for `npx skills add`
const RUNNERS = new Set(['npx', 'bunx', 'pnpx']);
const SKILLS_PACKAGE = /^(?:@[\w.-]+\/)?skills(?:@[\w.^~<>=*-]+)?$/;

/**
 * Looks at a command line such as `npx skills add owner/repo --skill foo` and returns the source and skill
 * names, or null when it is not a skills install. Works for npx, bunx, pnpx, `pnpm dlx`, `yarn dlx` and `npm exec`.
 */
export function parseSkillsInstall(tool, rest) {
  let args = rest.slice();
  if (!RUNNERS.has(tool)) {
    const i = args.findIndex((a) => !a.startsWith('-'));
    if (i < 0 || !['dlx', 'exec', 'x'].includes(args[i])) return null;
    args = args.slice(i + 1);
  }
  // runner options come first: -y, --yes, -p pkg, --package=pkg
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) { i += (args[i] === '-p' || args[i] === '--package') ? 2 : 1; }
  if (i >= args.length || !SKILLS_PACKAGE.test(args[i])) return null;
  const tail = args.slice(i + 1);
  const sub = tail.findIndex((a) => !a.startsWith('-'));
  if (sub < 0 || !['add', 'a', 'install', 'i'].includes(tail[sub])) return null;
  const options = tail.slice(sub + 1);
  const valueFlags = new Set(['-a', '--agent', '-s', '--skill', '--branch', '--ref']);
  const sources = [], skills = [];
  for (let k = 0; k < options.length; k++) {
    const a = options[k];
    if (a === '-s' || a === '--skill') { while (k + 1 < options.length && !options[k + 1].startsWith('-')) skills.push(options[++k]); continue; }
    if (a.startsWith('--skill=')) { skills.push(a.slice(8)); continue; }
    if (a.startsWith('-')) { if (valueFlags.has(a)) k++; continue; }
    sources.push(a);
  }
  return sources.length ? { sources, skills } : null;
}

// forkguard's own addition, on top of SkillSpector's score. SkillSpector's static rules also flag harmless text, and its
// AI review marks the findings it does not believe but never removes them. So forkguard stops an install only when the score
// is above 50 AND something looks like a real attack: a CRITICAL finding with confidence 0.85 or more, or strong
// HIGH findings (confidence 0.8 or more, not marked as probably an example) from at least two kinds of problem.
// The score and the findings themselves are SkillSpector's, unchanged. `strict` follows SkillSpector exactly.
export function isBlocked(r, strict = false) {
  if (r.score <= 50) return false;
  if (strict) return true;
  const strong = r.findings.filter((f) => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.confidence >= 0.8 && !f.tags.includes('likely-benign-context'));
  if (strong.some((f) => f.severity === 'CRITICAL' && f.confidence >= 0.85) || new Set(strong.map((f) => f.category)).size >= 2) return true;
  // The AI review can only add a reason to block. It can never lift a block, because the text it reads comes from the skill
  // and could talk the model into calling it harmless.
  return Boolean(r.ai) && r.findings.some((f) => (f.severity === 'CRITICAL' || f.severity === 'HIGH')
    && (f.evidence?.llm_review_outcome === 'confirmed' || (f.tags.includes('ai-discovered') && f.confidence >= 0.8)));
}

/** SAFE, CAUTION or DO_NOT_INSTALL, after forkguard's policy above. */
export const verdictOf = (r, strict = false) => (isBlocked(r, strict) ? 'DO_NOT_INSTALL' : r.score > 20 ? 'CAUTION' : 'SAFE');

export const strictMode = (flags) => Boolean(flags?.has?.('--strict')) || process.env.FORKGUARD_SKILLS_STRICT === '1';

export const VERDICT_TEXT = {
  SAFE: 'looks fine',
  CAUTION: 'worth a look before you use it',
  DO_NOT_INSTALL: 'do not install',
};

const sevColor = (s) => (s === 'CRITICAL' || s === 'HIGH' ? c.red(s.padEnd(8)) : s === 'MEDIUM' ? c.yellow(s.padEnd(8)) : c.dim(s.padEnd(8)));
const verdictColor = (v, text) => (v === 'DO_NOT_INSTALL' ? c.red(text) : v === 'CAUTION' ? c.yellow(text) : c.green(text));

/** Prints one scanned skill. `limit` caps how many findings are listed. */
export function printSkill(r, { limit = 8, all = false, strict = false } = {}) {
  const verdict = verdictOf(r, strict);
  console.log(`  ${c.bold(r.name)}  ${verdictColor(verdict, VERDICT_TEXT[verdict])}  ${c.dim(`score ${r.score}/100, ${r.severity.toLowerCase()} risk`)}`);
  if (r.ai) {
    const a = r.ai;
    console.log(c.dim(`    AI review (${a.provider}, ${a.model}): ${a.confirmed} confirmed, ${a.unconfirmed} not confirmed, ${a.discovered} found by the review${a.failed ? `, ${a.failed} of ${a.requests} requests failed` : ''}`));
  }
  if (r.score > 50 && verdict !== 'DO_NOT_INSTALL') console.log(c.dim(r.ai ? '    Many rules matched, but neither the rules nor the AI review found a clear attack, so this is not blocked. --strict follows SkillSpector exactly.' : '    Many rules matched, but nothing that clearly looks like an attack, so this is not blocked. --strict follows SkillSpector exactly.'));
  const shown = all ? r.findings : r.findings.slice(0, limit);
  for (const f of shown) {
    const where = `${f.file}:${f.line}`;
    const outcome = f.evidence?.llm_review_outcome;
    const note = f.tags.includes('ai-discovered') ? c.dim('  (found by the AI review)') : f.tags.includes('llm-unconfirmed') ? c.dim('  (AI did not confirm)') : outcome === 'confirmed' ? c.dim('  (AI confirmed)') : f.tags.includes('likely-benign-context') ? c.dim('  (probably an example)') : '';
    const msg = f.message.length > 56 ? `${f.message.slice(0, 53)}...` : f.message;
    const seen = f.matchedText ? JSON.stringify(f.matchedText.replace(/\s+/g, ' ').slice(0, 44)) : '';
    console.log(`    ${sevColor(f.severity)} ${f.ruleId.padEnd(5)} ${where}  ${msg}${seen ? `  ${c.dim(seen)}` : ''}${note}`);
  }
  if (r.findings.length > shown.length) console.log(c.dim(`    ... and ${r.findings.length - shown.length} more. Add --all to see every one.`));
  for (const e of r.errors || []) console.log(c.dim(`    could not run ${e.module} on ${e.file}: ${e.message}`));
  for (const s of r.skipped || []) console.log(c.dim(`    skipped ${s.path} (${s.skipped})`));
}

export const skillsExitCode = (results, strict = false) => (results.some((r) => isBlocked(r, strict)) ? 1 : 0);

/** Slim JSON for --json. */
export function skillsJson(results, strict = false) {
  return results.map((r) => ({
    skill: r.name, path: r.path, score: r.score, severity: r.severity, recommendation: r.recommendation, verdict: verdictOf(r, strict), blocked: isBlocked(r, strict),
    filesScanned: r.filesScanned, skipped: r.skipped, ai: r.ai ?? null,
    findings: r.findings.map((f) => ({ rule: f.ruleId, severity: f.severity, confidence: f.confidence, file: f.file, line: f.line, message: f.message, matched: f.matchedText, category: f.category, tags: f.tags, review: f.evidence?.llm_review_outcome ?? null, explanation: r.ai ? f.explanation : undefined, occurrences: f.occurrences, remediation: f.remediation })),
  }));
}

