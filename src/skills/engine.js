// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Finding model, de-duplication and scoring, following SkillSpector's models.py, deduplicate.py and report.py.
import { createHash } from 'node:crypto';
import { TABLES } from './text.js';

export const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEVERITY_POINTS = { CRITICAL: 50, HIGH: 25, MEDIUM: 10, LOW: 5 };
const MAX_OCCURRENCES_PER_RULE = 3;
const DIMINISHING_WEIGHTS = [1.0, 0.5, 0.25];
const RISK_BANDS = [[81, 'CRITICAL'], [51, 'HIGH'], [21, 'MEDIUM'], [0, 'LOW']];
const RECOMMENDATION = { LOW: 'SAFE', MEDIUM: 'CAUTION', HIGH: 'DO_NOT_INSTALL', CRITICAL: 'DO_NOT_INSTALL' };
const RULE_FLOORS = { SC8: 51 };

export const CATEGORY = {
  PROMPT_INJECTION: 'Prompt Injection', DATA_EXFILTRATION: 'Data Exfiltration', PRIVILEGE_ESCALATION: 'Privilege Escalation',
  SUPPLY_CHAIN: 'Supply Chain', EXCESSIVE_AGENCY: 'Excessive Agency', OUTPUT_HANDLING: 'Output Handling',
  SYSTEM_PROMPT_LEAKAGE: 'System Prompt Leakage', MEMORY_POISONING: 'Memory Poisoning', TOOL_MISUSE: 'Tool Misuse',
  ROGUE_AGENT: 'Rogue Agent', TRIGGER_ABUSE: 'Trigger Abuse', YARA_MATCH: 'YARA Match', MCP_LEAST_PRIVILEGE: 'MCP Least Privilege',
  MCP_TOOL_POISONING: 'MCP Tool Poisoning', AGENT_SNOOPING: 'Agent Snooping', ANTI_REFUSAL: 'Anti-Refusal',
  SSRF: 'Server-Side Request Forgery', DESERIALIZATION: 'Insecure Deserialization',
};

const DEFAULTS = TABLES.pattern_defaults;

export const explanationFor = (id) => DEFAULTS.DEFAULT_EXPLANATIONS[id] || 'Potential security issue detected. Manual review is recommended.';
export const remediationFor = (id) => DEFAULTS.DEFAULT_REMEDIATIONS[id] || 'Review the flagged content for security risks. Ensure no credentials, secrets, or sensitive data are exposed.';
export const categoryFor = (id) => DEFAULTS.RULE_ID_TO_CATEGORY[id] || 'Security';
export const patternNameFor = (id) => DEFAULTS.PATTERN_NAMES[id] || 'Unknown';

/** sha256 of the rule and the whitespace-normalised matched text, as compute_match_fingerprint(). */
export function fingerprint(ruleId, text) {
  const normalized = text.trim().split(/\s+/).join(' ');
  return createHash('sha256').update(`${ruleId}\x1f${normalized}`).digest('hex');
}

/** One finding. `complete` is the full matched text, `matched` the first 200 characters of it. */
export function makeFinding({ ruleId, message, severity, file, line, endLine = null, column = null, endColumn = null, confidence = 0.5, tags = [], context = null, complete = null, matched = null, evidence = {} }) {
  const text = complete ?? matched;
  return {
    ruleId, message, severity, file, line, endLine, column, endColumn, confidence, tags: [...tags], context,
    matchedText: (matched ?? complete ?? '').slice(0, 200) || null, evidence,
    fingerprint: text ? fingerprint(ruleId, text) : null,
  };
}

const sevRank = (s) => SEVERITY_ORDER[s] ?? 4;

function representativeOrder(a, b) {
  return sevRank(a.severity) - sevRank(b.severity) || b.confidence - a.confidence
    || a.file.localeCompare(b.file) || a.line - b.line || (a.column ?? -1) - (b.column ?? -1);
}

/** Compacts exact same-location duplicates from one analyzer. */
export function dedupeAnalyzer(findings) {
  const groups = new Map();
  const keyOf = (f) => (f.fingerprint ? [f.file, f.line, f.endLine, f.column, f.endColumn, f.ruleId, f.fingerprint].join('\x1f') : null);
  for (const f of findings) { const k = keyOf(f); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); } }
  const out = [], done = new Set();
  for (const f of findings) {
    const k = keyOf(f);
    if (!k) out.push(f);
    else if (!done.has(k)) { out.push(groups.get(k).slice().sort(representativeOrder)[0]); done.add(k); }
  }
  return out;
}

/** Joins findings with the same rule and the same matched text, keeping every place it was found. */
export function dedupeAll(findings) {
  const groups = new Map(), loose = [];
  for (const f of findings) {
    if (!f.fingerprint) { loose.push(f); continue; }
    const key = [f.ruleId, f.fingerprint, f.message, f.severity, [...f.tags].sort().join('|')].join('\x1f');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const out = [];
  for (const group of groups.values()) {
    const ordered = group.slice().sort(representativeOrder);
    const seen = new Set(), occurrences = [];
    for (const f of ordered) {
      const k = `${f.file}:${f.line}:${f.column}`;
      if (!seen.has(k)) { seen.add(k); occurrences.push({ file: f.file, line: f.line }); }
    }
    out.push({ ...ordered[0], occurrences });
  }
  out.push(...loose);
  out.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));
  return out;
}

/**
 * Risk score from 0 to 100, as _compute_risk_score(). Each rule counts in full the first time, half the second
 * and a quarter the third; anything after that is ignored. Points are scaled by confidence, and findings in
 * executable files get 1.3 times.
 */
export function riskScore(findings, executableFiles = new Set()) {
  const sorted = findings.slice().sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) || sevRank(a.severity) - sevRank(b.severity));
  const seen = {};
  let score = 0, floor = 0;
  for (const f of sorted) {
    const conf = Math.max(0, Math.min(1, f.confidence));
    if (conf <= 0) continue;
    const base = SEVERITY_POINTS[(f.severity || 'LOW').toUpperCase()] ?? 5;
    const n = seen[f.ruleId] || 0;
    seen[f.ruleId] = n + 1;
    floor = Math.max(floor, RULE_FLOORS[f.ruleId] || 0);
    if (n >= MAX_OCCURRENCES_PER_RULE) continue;
    let add = base * DIMINISHING_WEIGHTS[n] * conf;
    if (executableFiles.has(f.file)) add *= 1.3;
    score += add;
  }
  const final = Math.min(100, Math.max(floor, Math.trunc(score)));
  const severity = RISK_BANDS.find(([min]) => final >= min)[1];
  return { score: final, severity, recommendation: RECOMMENDATION[severity] };
}
