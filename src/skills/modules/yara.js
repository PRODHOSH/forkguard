// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// SkillSpector's five YARA rule files, run without YARA. The rule files are copied unchanged into data/yara.
// This is a small evaluator for the part of the YARA language those files use: text, regex and hex strings,
// `any/all/N of`, `and/or/not`, rule references, `in (range)` and `for any i in (1..#x)`.
// Port of the matching and post-match filters in static_yara.py.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATEGORY } from '../engine.js';
import { Pass } from './util.js';
import { isDirectlyProhibited, PROMPT_REVEAL_TAIL } from './prohibition.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RULE_DIR = path.join(here, '..', 'data', 'yara');
const MAX_INSTANCES = 4096;

// ------------------------------------------------------------------ parsing
function stripComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === '/' && /[=(,]\s*$/.test(out.slice(-8))) {
      // a regex string literal: copy to its closing slash
      let j = i + 1;
      while (j < src.length && src[j] !== '/') { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

function parseString(line) {
  const m = /^\s*(\$\w*)\s*=\s*([\s\S]*)$/.exec(line);
  if (!m) return null;
  const id = m[1];
  let rest = m[2].trim();
  if (rest[0] === '"') {
    let j = 1, text = '';
    while (j < rest.length && rest[j] !== '"') { if (rest[j] === '\\') { const e = rest[j + 1]; text += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === 'x' ? String.fromCharCode(parseInt(rest.slice(j + 2, j + 4), 16)) : e; j += e === 'x' ? 4 : 2; continue; } text += rest[j++]; }
    const mods = rest.slice(j + 1).trim().split(/\s+/).filter(Boolean);
    return { id, kind: 'text', text, nocase: mods.includes('nocase'), wide: mods.includes('wide'), fullword: mods.includes('fullword') };
  }
  if (rest[0] === '/') {
    let j = 1;
    while (j < rest.length && rest[j] !== '/') { if (rest[j] === '\\') j++; j++; }
    const source = rest.slice(1, j);
    const after = rest.slice(j + 1).trim();
    const flagMatch = /^([a-z]*)/.exec(after);
    const rflags = flagMatch ? flagMatch[1] : '';
    const mods = after.slice(rflags.length).trim().split(/\s+/).filter(Boolean);
    return { id, kind: 'regex', source, nocase: rflags.includes('i') || mods.includes('nocase'), dotall: rflags.includes('s'), wide: mods.includes('wide') };
  }
  if (rest[0] === '{') {
    const hex = rest.slice(1, rest.indexOf('}')).trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16));
    return { id, kind: 'hex', bytes: Buffer.from(hex) };
  }
  return null;
}

function parseRules(source, namespace) {
  const src = stripComments(source);
  const rules = [];
  // Each rule starts with `rule name` at the beginning of a line, so split there. Counting braces would
  // trip over regex strings such as /a{1,8}/.
  const heads = [...src.matchAll(/^rule\s+(\w+)\s*\{/gm)];
  for (let h = 0; h < heads.length; h++) {
    const head = heads[h];
    const startBody = head.index + head[0].length;
    const endBody = h + 1 < heads.length ? heads[h + 1].index : src.length;
    const body = src.slice(startBody, endBody).replace(/\}\s*$/, '');
    const m = [null, head[1]];
    const metaAt = body.search(/\bmeta\s*:/), strAt = body.search(/\bstrings\s*:/), condAt = body.search(/\bcondition\s*:/);
    const meta = {};
    if (metaAt >= 0) {
      const end = [strAt, condAt].filter((x) => x > metaAt).sort((a, b) => a - b)[0] ?? body.length;
      for (const line of body.slice(metaAt + 5, end).split('\n')) { const k = /^\s*(\w+)\s*=\s*"([\s\S]*)"\s*$/.exec(line); if (k) meta[k[1]] = k[2]; }
    }
    const strings = [];
    if (strAt >= 0) {
      const end = condAt > strAt ? condAt : body.length;
      for (const line of body.slice(strAt + 8, end).split('\n')) { const s = parseString(line); if (s) strings.push(s); }
    }
    rules.push({ name: m[1], namespace, meta, strings, condition: condAt >= 0 ? body.slice(condAt + 10).trim() : '' });
  }
  return rules;
}

// ------------------------------------------------------------------ condition language
function tokenize(text) {
  const tokens = [];
  const re = /\s*(\$\w*\*?|#\w+|@\w+|\d+|\.\.|[()\[\],:+\-]|\w+)/gy;
  let m;
  while (re.lastIndex < text.length && (m = re.exec(text))) tokens.push(m[1]);
  return tokens;
}

function compileCondition(text, rule) {
  const t = tokenize(text);
  let p = 0;
  const peek = () => t[p], next = () => t[p++];
  const expect = (x) => { if (next() !== x) throw new Error(`yara: expected ${x} in ${rule.name}`); };
  const ids = rule.strings.map((s) => s.id);

  function setOf() {
    if (peek() === 'them') { next(); return () => ids; }
    expect('(');
    const parts = [];
    while (peek() !== ')') { const x = next(); if (x !== ',') parts.push(x); }
    expect(')');
    return () => parts.flatMap((x) => (x.endsWith('*') ? ids.filter((i) => i.startsWith(x.slice(0, -1))) : [x]));
  }

  function arith() {
    let left = term();
    while (peek() === '+' || peek() === '-') { const op = next(); const right = term(); const l = left; left = (e) => (op === '+' ? l(e) + right(e) : l(e) - right(e)); }
    return left;
  }
  function term() {
    const x = next();
    if (/^\d+$/.test(x)) return () => Number(x);
    if (x[0] === '#') return (e) => (e.matches.get('$' + x.slice(1)) ?? []).length;
    if (x[0] === '@') {
      const name = '$' + x.slice(1);
      expect('[');
      const idx = next();
      expect(']');
      return (e) => (e.matches.get(name) ?? [])[(idx === 'i' ? e.loop : Number(idx)) - 1]?.index ?? NaN;
    }
    if (x === 'i') return (e) => e.loop;
    throw new Error(`yara: unsupported term ${x} in ${rule.name}`);
  }

  function primary() {
    const x = peek();
    if (x === '(') { next(); const e = or(); expect(')'); return e; }
    if (x === 'for') {
      next(); expect('any'); next() /* variable */; expect('in'); expect('(');
      const lo = arith(); expect('..'); const hi = arith(); expect(')'); expect(':'); expect('(');
      const body = or(); expect(')');
      return (e) => { const a = lo(e), b = hi(e); for (let i = a; i <= b; i++) if (body({ ...e, loop: i })) return true; return false; };
    }
    if (x === 'any' || x === 'all' || /^\d+$/.test(x)) {
      next(); expect('of');
      const set = setOf();
      return (e) => {
        const list = set(); const hit = list.filter((id) => (e.matches.get(id) ?? []).length > 0).length;
        return x === 'any' ? hit >= 1 : x === 'all' ? hit === list.length : hit >= Number(x);
      };
    }
    if (x[0] === '$') {
      next();
      if (peek() === 'in') {
        next(); expect('(');
        const lo = arith(); expect('..'); const hi = arith(); expect(')');
        return (e) => { const a = lo(e), b = hi(e); return (e.matches.get(x) ?? []).some((m) => m.index >= a && m.index <= b); };
      }
      return (e) => (e.matches.get(x) ?? []).length > 0;
    }
    next();
    return (e) => e.rules.get(x) === true; // another rule
  }
  function not() { if (peek() === 'not') { next(); const e = not(); return (env) => !e(env); } return primary(); }
  function and() { let l = not(); while (peek() === 'and') { next(); const r = not(); const a = l; l = (e) => a(e) && r(e); } return l; }
  function or() { let l = and(); while (peek() === 'or') { next(); const r = and(); const a = l; l = (e) => a(e) || r(e); } return l; }
  return or();
}

// ------------------------------------------------------------------ string matching
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findAll(def, text, buf) {
  const out = [];
  if (def.wide && !def.ascii && def.kind === 'text' && false) return out;
  if (def.kind === 'hex') {
    let from = 0, at;
    while (out.length < MAX_INSTANCES && (at = buf.indexOf(def.bytes, from)) >= 0) { out.push({ index: at, length: def.bytes.length, text: def.bytes.toString('latin1') }); from = at + 1; }
    return out;
  }
  const re = def.kind === 'text'
    ? new RegExp(def.fullword ? `\\b${escapeRe(def.text)}\\b` : escapeRe(def.text), def.nocase ? 'gi' : 'g')
    : new RegExp(def.source, 'g' + (def.nocase ? 'i' : '') + (def.dotall ? 's' : ''));
  let m;
  while (out.length < MAX_INSTANCES && (m = re.exec(text))) { out.push({ index: m.index, length: m[0].length, text: m[0] }); if (!m[0].length) re.lastIndex++; }
  return out;
}

// ------------------------------------------------------------------ loading
let LOADED = null;
export function loadYaraRules() {
  if (LOADED) return LOADED;
  const rules = [];
  for (const file of readdirSync(RULE_DIR).filter((f) => f.endsWith('.yar')).sort()) {
    const ns = file.replace(/\.yar$/, '');
    for (const r of parseRules(readFileSync(path.join(RULE_DIR, file), 'utf8'), ns)) {
      r.test = compileCondition(r.condition, r);
      rules.push(r);
    }
  }
  LOADED = rules;
  return rules;
}

// ------------------------------------------------------------------ post-match filters (static_yara.py)
const PAYMENT_IDS = new Set(['$payment_then_context', '$context_then_payment', '$explicit_ransom_payment']);
const PAYMENT_FIRST = new Set(['$payment_then_context', '$explicit_ransom_payment']);
const DIRECT_NEGATION = /(?:^|(?<=[\r\n.;:!?,]))[ \t]*(?:(?:[-*+>]|\d{1,3}[.)])[ \t]+){0,3}(?:["'(\[]|‘|“)?[*_]{0,2}(?:you[ \t]+(?:(?:should|must)[ \t]+)?)?(?:never|do[ \t]+not|don(?:'|’)t|must[ \t]+not|should[ \t]+not|avoid)[*_]{0,2}(?:[ \t]+ever)?[ \t]+$/i;
const MIN_PAYMENT = /^(?:pay|send)[ \t]{1,8}(?:(?:anything|any[ \t]{1,8}amount)[ \t]{1,8})?(?:less|fewer)[ \t]{1,8}than\b/i;
const STORAGE_CONT = /^[ \t]+(?:at[ \t]+rest|in[ \t]+transit)\b/i;

function paymentNegated(text, offset) {
  const start = Math.max(0, offset - 80);
  if (!DIRECT_NEGATION.test(text.slice(start, offset))) return false;
  return !MIN_PAYMENT.test(text.slice(offset));
}

function ransomwareFilter(instances, text) {
  const accepted = [];
  for (const ins of instances) {
    if (ins.id === '$ransom_note') {
      const end = ins.index + ins.length;
      const c = STORAGE_CONT.exec(text.slice(end, end + 81));
      if (c && c[0].length <= 80) continue;
    }
    if (!PAYMENT_IDS.has(ins.id)) { accepted.push(ins); continue; }
    const localStart = Math.max(0, ins.index - 80);
    const localEnd = Math.min(text.length, ins.index + ins.length);
    const prefix = text.slice(localStart, ins.index);
    const local = prefix + text.slice(ins.index, localEnd);
    let offsets = [...local.matchAll(/\b(?:pay|send)\b/gi)].map((m) => m.index).filter((o) => o >= prefix.length);
    if (PAYMENT_FIRST.has(ins.id)) offsets = offsets.slice(0, 1);
    if (offsets.length && offsets.every((o) => paymentNegated(text, localStart + o))) continue;
    accepted.push(ins);
  }
  return accepted;
}

const REVEAL = /(reveal|print|dump|expose|show)\s+(the\s+)?(system|developer)\s+(prompt|message|instructions)/gi;
function promptRevealFilter(instances, text) {
  if (!instances.some((i) => i.id === '$inj_reveal_prompt')) return instances;
  const retained = instances.filter((i) => i.id !== '$inj_reveal_prompt');
  let removed = false;
  for (const m of text.matchAll(REVEAL)) {
    const start = m.index, end = m.index + m[0].length;
    const left = Math.max(0, start - 2052), right = Math.min(text.length, end + 2052);
    let prefix = text.slice(left, start), action = text.slice(start, end), suffix = text.slice(end, right);
    if (left) prefix = 'x' + prefix;
    if (right < text.length) suffix += 'x';
    const prohibited = isDirectlyProhibited(prefix + action + suffix, prefix.length, prefix.length + action.length, { allowedTail: PROMPT_REVEAL_TAIL(), allowYaraContinuation: true });
    if (prohibited) { removed = true; continue; }
    retained.push({ id: '$inj_reveal_prompt', index: start, length: m[0].length, text: m[0] });
  }
  if (!removed) return instances;
  const ids = new Set(retained.map((i) => i.id));
  const hidden = [...ids].some((i) => i.startsWith('$hidden_'));
  const inj = [...ids].filter((i) => i.startsWith('$inj_'));
  if (!(hidden || (ids.has('$agent_context') && inj.length) || inj.length >= 2)) return [];
  return retained.filter((i) => i.id !== '$agent_context');
}

function destructiveLocal(instances, text) {
  const lineOf = (o) => text.slice(0, o).split('\n').length;
  const destructive = [], autonomy = [];
  for (const i of instances) {
    if (i.id === '$destructive_rm_root') return true;
    if (i.id.startsWith('$destructive_')) destructive.push(lineOf(i.index));
    else if (i.id.startsWith('$autonomy_')) autonomy.push(lineOf(i.index));
  }
  return destructive.some((d) => autonomy.some((a) => Math.abs(d - a) <= 3));
}

const CATEGORY_MAP = { malware: ['YR1', 'CRITICAL'], webshell: ['YR2', 'CRITICAL'], cryptominer: ['YR3', 'HIGH'], hack_tool: ['YR4', 'HIGH'], exploit: ['YR4', 'HIGH'] };

export const yara = {
  id: 'static_yara',
  analyze(content, file, fileType, ctx, view) {
    if (view) return []; // YARA reads the raw bytes only
    const pass = new Pass(content, file, fileType, CATEGORY.YARA_MATCH, null);
    const buf = Buffer.from(content, 'utf8');
    const ruleResults = new Map();
    for (const rule of loadYaraRules()) {
      const matches = new Map();
      for (const def of rule.strings) {
        const found = findAll(def, content, buf);
        if (found.length) matches.set(def.id, found);
      }
      const hit = rule.test({ matches, rules: ruleResults, loop: 0 });
      ruleResults.set(rule.name, hit);
      if (!hit) continue;
      // One instance per matched string, like YARA's fast mode.
      let instances = [...matches].map(([id, list]) => ({ id, ...list[0] }));
      if (rule.namespace === 'agent_skills' && rule.name === 'agent_skill_prompt_injection_hidden_instructions') {
        instances = promptRevealFilter(instances, content);
        if (!instances.length) continue;
      }
      if (rule.namespace === 'agent_skills' && rule.name === 'agent_skill_destructive_autonomous_actions' && !destructiveLocal(instances, content)) continue;
      instances = rule.namespace === 'malware' && rule.name === 'ransomware_behavior' ? ransomwareFilter(instances, content) : instances;
      if (!instances.length) continue;
      const [ruleId, defaultSeverity] = CATEGORY_MAP[(rule.meta.category || '').toLowerCase()] ?? ['YR4', 'MEDIUM'];
      const sev = (rule.meta.severity || '').toUpperCase();
      const severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(sev) ? sev : defaultSeverity;
      const confidence = Number.isFinite(Number(rule.meta.confidence)) && rule.meta.confidence !== undefined ? Number(rule.meta.confidence) : 0.7;
      const first = Math.min(...instances.map((i) => i.index));
      const matched = instances.map((i) => i.text).join('; ').slice(0, 200);
      let message = `YARA rule '${rule.name}'`;
      if (rule.meta.description) message += `: ${rule.meta.description}`;
      message += ` [${rule.namespace}]`;
      pass.addAt(ruleId, message, severity, first, null, confidence, matched, { context: content.slice(Math.max(0, first - 400), first + 600).slice(0, 1000) });
    }
    return pass.findings;
  },
};
