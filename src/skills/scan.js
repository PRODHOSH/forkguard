// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Scans a skill folder. Follows the shape of SkillSpector's graph: read the files, run every rule module on
// each file (the raw text and the normalised "security view"), merge repeats, then score.
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { dedupeAll, riskScore, explanationFor, remediationFor, categoryFor, patternNameFor } from './engine.js';
import { splitlines } from './text.js';
import { viewDiffers, normalizedView } from './modules/view.js';
import { MODULES } from './modules/index.js';

const MAX_FILE_BYTES = 1_000_000;
const SKIP_DIRS = new Set(['__pycache__', 'node_modules', '.venv', 'venv', '.tox', '.pytest_cache', '.git']);

const FILE_TYPES = {
  '.md': 'markdown', '.mdc': 'markdown', '.markdown': 'markdown', '.py': 'python', '.pyw': 'python', '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.ps1': 'powershell', '.psm1': 'powershell', '.psd1': 'powershell', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.txt': 'text',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.ts': 'typescript', '.rb': 'ruby', '.pl': 'perl', '.go': 'go', '.rs': 'rust',
};
const EXECUTABLE_SUFFIXES = new Set(['.app', '.bash', '.bat', '.bin', '.cmd', '.com', '.cjs', '.class', '.cts', '.dll', '.dex', '.dylib', '.exe', '.go', '.js', '.jsx', '.luac', '.mjs', '.msi', '.mts', '.php', '.php3', '.php4', '.php5', '.pl', '.phtml', '.ps1', '.py', '.pyw', '.pyc', '.pyo', '.rb', '.rake', '.rs', '.sh', '.so', '.svg', '.ts', '.tsx', '.wasm', '.zsh']);
const LICENSE_BASENAME = /^(?:license|licenses|copying|notice|notices|(?:[^/]*[._-])?ofl)(?:[._-].*)?$/;

export const inferFileType = (p) => { const i = p.lastIndexOf('.'); return FILE_TYPES[i >= 0 ? p.slice(i).toLowerCase() : ''] || 'other'; };
const suffixOf = (p) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i).toLowerCase() : ''; };

/** Every readable file in a skill folder, relative to it. Symlinks are not followed. */
export function listSkillFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
      if (!e.isFile()) continue;
      let size = 0;
      try { size = statSync(full).size; } catch { continue; }
      if (size > MAX_FILE_BYTES) { out.push({ path: path.relative(root, full).split(path.sep).join('/'), skipped: 'too large' }); continue; }
      out.push({ path: path.relative(root, full).split(path.sep).join('/'), full });
    }
  };
  walk(root);
  return out;
}

/** Name from a SKILL.md front matter block, when there is one. */
export function manifestName(skillMd) {
  const m = /^﻿*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*$/m.exec(skillMd || '');
  if (!m) return null;
  const n = /^name:[ \t]*["']?([^"'\r\n#]+?)["']?[ \t]*$/m.exec(m[1]);
  return n ? n[1].trim() : null;
}

function normalizeLicenseLine(line) { return line.toLowerCase().split(/\s+/).filter(Boolean).join(' '); }
const LICENSE_RANGES = [
  [['"source" form shall mean the preferred form for making modifications,', 'including but not limited to software source code, documentation', 'source, and configuration files.'], 1],
  [['transformation or translation of a source form, including but', 'not limited to compiled object code, generated documentation,', 'and conversions to other media types.'], 1],
  [['the copyright owner. For the purposes of this definition, "submitted"', 'means any form of electronic, verbal, or written communication sent', 'to the Licensor or its representatives, including but not limited to', 'communication on electronic mailing lists, source code control systems,'], 2],
  [['result of this License or out of the use or inability to use the', 'Work (including but not limited to damages for loss of goodwill,', 'work stoppage, computer failure or malfunction, or any and all'], 1],
  [['the software is provided "as is", without warranty of any kind, express or', 'implied, including but not limited to the warranties of merchantability,', 'fitness for a particular purpose and NONINFRINGEMENT. in no event shall the'], 1],
  [['this software is provided by the copyright holders and contributors "as is"', 'and any express or implied warranties, including, but not limited to, the', 'implied warranties of merchantability and fitness for a particular purpose are'], 1],
  [['the font software is provided "as is", without warranty of any kind,', 'express or implied, including but not limited to any warranties of', 'merchantability, fitness for a particular purpose and noninfringement'], 1],
];
function isLicenseBoilerplate(normalized, startLine) {
  if (startLine < 1 || startLine > normalized.length) return false;
  for (const [canonical, offset] of LICENSE_RANGES) {
    const rs = startLine - offset - 1;
    if (rs < 0) continue;
    const want = canonical.map(normalizeLicenseLine);
    if (want.every((l, i) => normalized[rs + i] === l)) return true;
  }
  return false;
}
function isLicenseFile(p, fileType) {
  if (!['markdown', 'text', 'other'].includes(fileType)) return false;
  const base = p.replace(/\\/g, '/').split('/').pop();
  if (fileType === 'other' && base.includes('.') && '.' + base.split('.').pop().toLowerCase() !== '.lesser') return false;
  return LICENSE_BASENAME.test(base.toLowerCase());
}

const PE3_ENV_SETUP = [
  /^(?:[-*]\s*)?(?:cp|copy|mv|rename)\s+\.env\.(?:example|sample|template)\s+(?:to\s+)?\.env(?:\s+(?:before\s+(?:running|starting)(?:\s+the\s+app)?|for\s+local\s+development))?[.:]?$/i,
  /^(?:create|configure|set\s+up|make|add)\s+(?:an?\s+|the\s+)?\.env(?:\s+file)?(?:\s+in\s+the\s+project\s+root)?(?:\s+with\s+(?:your\s+)?api\s+keys?|\s+for\s+(?:local\s+)?(?:development|testing))?[.:]?$/i,
  /^(?:install|use)\s+(?:python-)?dotenv\s+to\s+load\s+(?:the\s+)?\.env\s+file[.:]?$/i,
];

/** Findings for one file's text. `view` is the normalised view, or null for the raw text. */
function runModules(content, file, fileType, ctx, view) {
  const out = [];
  for (const mod of MODULES) {
    try { out.push(...mod.analyze(view ? view.text : content, file, fileType, ctx, view ? { original: content, offsets: view.offsets } : null)); }
    catch (err) { ctx.errors.push({ module: mod.id, file, message: err.message }); }
  }
  return out;
}

const findingKey = (f) => [f.ruleId, f.file, f.line, f.endLine, f.column, f.endColumn, f.fingerprint].join('\x1f');

/**
 * Scans text files. `files` is a list of { path, content } relative to the skill root.
 * Returns the findings and the verdict, shaped like SkillSpector's report.
 */
export function scanFiles(files, { skillName = null } = {}) {
  const skillMd = files.find((f) => f.path.toLowerCase() === 'skill.md');
  const ctx = { skillName, manifestName: manifestName(skillMd?.content), errors: [] };
  let all = [];
  for (const { path: file, content } of files) {
    if (content.slice(0, 512).includes('\0')) continue; // binary
    const fileType = inferFileType(file);
    const normalizedLines = isLicenseFile(file, fileType) ? splitlines(content).map(normalizeLicenseLine) : null;
    const lines = splitlines(content);
    const raw = runModules(content, file, fileType, ctx, null);
    let derived = [];
    if (viewDiffers(content)) derived = runModules(content, file, fileType, ctx, normalizedView(content));
    const rawKeys = new Set(raw.map(findingKey));
    const merged = [...raw, ...derived.filter((f) => !rawKeys.has(findingKey(f)))];
    for (const f of merged) {
      if (f.ruleId === 'EA3' && normalizedLines && isLicenseBoilerplate(normalizedLines, f.line)) continue;
      if (f.ruleId === 'PE3' && ['markdown', 'text'].includes(fileType) && !file.toLowerCase().endsWith('skill.md') && f.context) {
        const line = (lines[f.line - 1] ?? '').replace(/`/g, '').trim();
        if (PE3_ENV_SETUP.some((re) => re.test(line))) for (const t of ['contextual-triage', 'likely-benign-context']) if (!f.tags.includes(t)) f.tags.push(t);
      }
      all.push({
        ...f,
        category: f.tags[0] && !f.tags[0].includes('-') ? f.tags[0] : categoryFor(f.ruleId),
        pattern: f.message || patternNameFor(f.ruleId),
        explanation: explanationFor(f.ruleId),
        remediation: remediationFor(f.ruleId),
      });
    }
  }
  const findings = dedupeAll(all).map((f, i) => ({ ...f, id: `F${i + 1}` }));
  const executable = new Set(files.filter((f) => EXECUTABLE_SUFFIXES.has(suffixOf(f.path)) || f.content.startsWith('#!')).map((f) => f.path));
  const verdict = riskScore(findings, executable);
  return { findings, ...verdict, filesScanned: files.length, errors: ctx.errors, files, executableFiles: [...executable] };
}

/** Scans a folder on disk. */
export function scanSkillFolder(root) {
  const listed = listSkillFiles(root);
  const files = [], skipped = [];
  for (const f of listed) {
    if (f.skipped) { skipped.push(f); continue; }
    try { files.push({ path: f.path, content: readFileSync(f.full, 'utf8') }); } catch { skipped.push({ path: f.path, skipped: 'unreadable' }); }
  }
  const result = scanFiles(files, { skillName: path.basename(path.resolve(root)) });
  return { ...result, skipped, root };
}

export { existsSync, lstatSync };
