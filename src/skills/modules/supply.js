// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Supply chain (SC1-SC3, SC7), trigger abuse (TR1-TR3), system prompt leakage (P6-P8) and tool misuse (TM1-TM4).
// Ports of the matching parts of static_patterns_supply_chain.py, static_patterns_system_prompt_leakage.py and
// static_patterns_tool_misuse.py in SkillSpector.
// Not ported: package version lookups (SC4-SC6 need network and registries), shipped bytecode (SC8),
// concealed executables (SC9), the Python syntax-tree and shell-tokenizer proofs that only lower or remove findings.
import { createHash } from 'node:crypto';
import { table, pairs, rx, rxOf, getContextFromLines, splitlines, LOGICAL_LINE_BREAK, patternMatches, paragraphMatches, PY_I, PY_M } from '../text.js';
import { CATEGORY } from '../engine.js';
import { Pass, FLAGS_IM, inPairs, matchesFor } from './util.js';
import { isDirectlyProhibited, PROMPT_REVEAL_TAIL } from './prohibition.js';

const gx = (re, flags = '') => new RegExp(re.source, re.flags.replace(/[gy]/g, '') + flags);
const search = (re, s, from = 0) => { const g = gx(re, 'g'); g.lastIndex = from; return g.exec(s); };
const fullmatch = (re, s) => new RegExp(`^(?:${re.source})$`, re.flags.replace(/[gy]/g, '')).exec(s);

// ============================================================================ supply chain
const SM = 'static_patterns_supply_chain';
const ST = (n) => table(SM, n);
const SR = (n) => rxOf(ST(n));
const SC1 = pairs(SM, 'SC1_PATTERNS'), SC1P = pairs(SM, 'SC1_PROSE_PATTERNS');
const SC2 = pairs(SM, 'SC2_PATTERNS'), SC2P = pairs(SM, 'SC2_PROSE_PATTERNS');
const SC3 = pairs(SM, 'SC3_PATTERNS'), SC3P = pairs(SM, 'SC3_PROSE_PATTERNS'), SC3_SHELL = pairs(SM, 'SC3_SHELL_PATTERNS');
const SC7 = pairs(SM, 'SC7_PATTERNS');
const TRUSTED = ST('_TRUSTED_DOMAINS');

function dependencyFilename(p) { return p.replace(/\\/g, '/').split('/').pop().toLowerCase(); }
function isRequirementsFile(p) {
  const parts = p.replace(/\\/g, '/').toLowerCase().split('/');
  const f = parts[parts.length - 1];
  if (['requirements', 'requirements.txt', 'requirements.in'].includes(f) || /^(?:requirements[-_][a-z0-9_-]+|[a-z0-9][a-z0-9_-]*[-_]requirements)\.(?:txt|in)$/.test(f)) return true;
  return parts.slice(0, -1).includes('requirements') && /^[a-z0-9][a-z0-9_-]*\.(?:txt|in)$/.test(f);
}
export function isDependencyManifest(p) {
  const f = dependencyFilename(p);
  return isRequirementsFile(p) || ['package.json', 'pyproject.toml', 'setup.py', 'pipfile', 'pipfile.lock', 'uv.lock', 'poetry.lock', 'package-lock.json', 'npm-shrinkwrap.json'].includes(f);
}

const URL_TOKEN = /https?:\/\/[^\s|;&)]+|(?<![?=&/])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s|;&)]*)?/gi;
function isTrustedSource(text) {
  for (const m of text.matchAll(URL_TOKEN)) {
    const token = m[0].replace(/^["'`<>()[\]{}]+|["'`<>()[\]{}]+$/g, '');
    let host = '';
    try { host = new URL(token.includes('://') ? token : `//${token}`, 'http://x').hostname; } catch { host = ''; }
    host = host.replace(/\.$/, '').toLowerCase();
    if (TRUSTED.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  }
  return false;
}
const isSafeSupplyChainPattern = (text) => isTrustedSource(text) || /(?:pip|npm)\s+install/i.test(text);

function isWarnedInternalInstaller(content, m, fileType, index) {
  if (!['markdown', 'text'].includes(fileType)) return false;
  const pipe = search(SR('_PIPE_TO_SHELL'), m.text);
  if (!pipe) return false;
  const pipeStart = m.index + pipe.index, pipeEnd = m.index + pipe.index + pipe[0].length;
  if (new RegExp(LOGICAL_LINE_BREAK.source).test(content.slice(pipeStart, pipeEnd))) return false;
  const [, , lineIdx] = [0, 0, index.line(pipeStart) - 1];
  const lineStart = index.starts[lineIdx];
  const sep = search(new RegExp(LOGICAL_LINE_BREAK.source), content, pipeEnd);
  const lineEnd = sep ? sep.index : content.length;
  if (lineEnd - lineStart > ST('_MAX_WARNED_INSTALLER_LINE_CHARS')) return false;
  const line = content.slice(lineStart, lineEnd);
  if ([...line.matchAll(gx(SR('_PIPE_TO_SHELL'), 'g'))].length !== 1) return false;
  const lp = pipeStart - lineStart, le = pipeEnd - lineStart;
  const codeStart = line.lastIndexOf('`', lp - 1);
  const descriptorEnd = codeStart >= 0 ? codeStart : lp;
  const descriptorPrefix = line.slice(0, descriptorEnd).split(/(?:[.!?;]\s+|\n)/).pop();
  const trailing = line.slice(le);
  if (search(SR('_INSTALLER_WARNING_NEGATION'), `${descriptorPrefix} ${trailing}`)) return false;
  return search(SR('_INSTALLER_WARNING'), descriptorPrefix) !== null && search(SR('_INTERNAL_INSTALLER'), descriptorPrefix) !== null
    && search(SR('_SOURCE_REVIEW_BEFORE_RUN'), trailing) !== null;
}

export const supplyChain = {
  id: 'static_patterns_supply_chain',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.SUPPLY_CHAIN, view);
    if (isDependencyManifest(file)) {
      for (const pair of SC1) for (const m of matchesFor(inPairs(pair, SC1P), pair[0], content, PY_M)) pass.add('SC1', 'Unpinned Dependencies', 'LOW', m, pair[1]);
    }
    for (const pair of SC2) {
      for (const m of matchesFor(inPairs(pair, SC2P), pair[0], content, FLAGS_IM)) {
        const warned = isWarnedInternalInstaller(content, m, fileType, pass.index);
        const safe = isSafeSupplyChainPattern(m.text);
        const tags = warned ? [...pass.tags, 'contextual-triage', 'explicit-risk-warning'] : pass.tags;
        let message = 'External Script Fetching', remediation = null, explanation = null;
        if (warned) {
          message = 'Warned Pipe-to-Shell Installer';
          remediation = 'Keep the warning adjacent to this command. Prefer a checksum, signature, or inspect-before-execute flow instead of piping fetched content directly to a shell.';
          explanation = 'The matched documentation explicitly warns that an internal installer is fetched and piped directly to a shell. The warning provides context, but the command still executes remote code without an inspection step.';
        }
        const f = pass.add('SC2', message, safe ? 'LOW' : 'HIGH', m, safe ? Math.min(pair[1], 0.15) : pair[1], { tags });
        if (remediation) f.remediation = remediation;
        if (explanation) f.explanation = explanation;
      }
    }
    const hasDecoder = search(SR('_SC3_SHELL_DECODE_COMMAND'), content) !== null;
    let sc3 = ['python', 'javascript', 'shell', 'perl', 'powershell', 'other'].includes(fileType) || file.toLowerCase().endsWith('.mdc') ? SC3 : [];
    if (hasDecoder) sc3 = sc3.concat(SC3_SHELL);
    for (const pair of sc3) for (const m of matchesFor(inPairs(pair, SC3P), pair[0], content, FLAGS_IM)) pass.add('SC3', 'Obfuscated Code', 'HIGH', m, pair[1]);
    for (const pair of SC7) for (const m of patternMatches(pair[0], content, FLAGS_IM)) pass.add('SC7', 'Untrusted Container Image', 'HIGH', m, pair[1]);
    return pass.findings;
  },
};

// ============================================================================ trigger abuse (TR1-TR3)
const BUILTIN = new Set(ST('_BUILTIN_COMMANDS')), BROAD = new Set(ST('_OVERLY_BROAD_SINGLE_WORDS'));
const MAX_CLAUSES = ST('_MAX_DESCRIPTION_CLAUSES'), MAX_CLAUSE_CHARS = ST('_MAX_DESCRIPTION_CLAUSE_CHARS'), MAX_WINDOWS = ST('_MAX_DESCRIPTION_SIGNAL_WINDOWS'), MAX_SPAN = ST('_MAX_DESCRIPTION_CONDITION_SPAN');

/** name, description and triggers from the front matter of a SKILL.md. A small reader, not a full YAML parser. */
export function readFrontmatter(text) {
  const m = /^﻿*---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text || '');
  if (!m) return {};
  const out = {}, lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1], raw = kv[2].trim();
    if (key === 'triggers' || key === 'permissions' || key === 'allowed-tools') {
      const items = [];
      if (raw.startsWith('[')) items.push(...raw.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean));
      else while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      out[key] = items;
    } else if (/^[>|][+-]?$/.test(raw)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim());
      out[key] = block.join(raw.startsWith('>') ? ' ' : '\n').trim();
    } else out[key] = raw.replace(/^["']|["']$/g, '');
  }
  return out;
}

function descriptionClauses(description) {
  const SR2 = (n) => SR(n);
  const hasSignal = (t) => search(SR2('_DESCRIPTION_ACTIVATION_CONDITION_RE'), t) || search(SR2('_DESCRIPTION_UNIVERSAL_SCOPE_RE'), t) || search(SR2('_DESCRIPTION_INVOCATION_RE'), t);
  const windows = (text) => {
    const spans = [];
    for (const n of ['_DESCRIPTION_ACTIVATION_CONDITION_RE', '_DESCRIPTION_UNIVERSAL_SCOPE_RE', '_DESCRIPTION_INVOCATION_RE']) {
      const g = gx(SR2(n), 'g'); let m;
      while ((m = g.exec(text))) { spans.push([Math.max(0, m.index - MAX_CLAUSE_CHARS), m.index + m[0].length + MAX_CLAUSE_CHARS]); if (!m[0]) g.lastIndex++; }
    }
    spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const [s, e] of spans) { if (merged.length && s <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e); else merged.push([s, e]); }
    return merged.slice(0, MAX_WINDOWS).map(([s, e]) => text.slice(s, e).trim());
  };
  const out = []; let omitted = 0;
  for (const clause of description.split(/[.;:!?]\s*|\s+-\s+/)) {
    let text = clause.trim().replace(/^,+|,+$/g, '');
    if (!text || !hasSignal(text)) continue;
    if (out.length >= MAX_CLAUSES) { omitted++; continue; }
    if (text.length > MAX_CLAUSE_CHARS) text = windows(text).join(' ... ');
    out.push(text);
  }
  return out;
}
function conditionHasUniversalScope(clause) {
  const cond = search(SR('_DESCRIPTION_ACTIVATION_CONDITION_RE'), clause);
  if (!cond) return false;
  const rest = clause.slice(cond.index + cond[0].length);
  const boundary = search(SR('_DESCRIPTION_CONDITION_BOUNDARY_RE'), rest);
  let span = boundary ? rest.slice(0, boundary.index) : rest;
  span = span.slice(0, MAX_SPAN);
  return search(SR('_DESCRIPTION_UNIVERSAL_SCOPE_RE'), span) !== null;
}
function shadowedCommands(clause) {
  const shadowed = new Set();
  for (const m of clause.matchAll(gx(SR('_DESCRIPTION_SLASH_COMMAND_RE'), 'g'))) if (BUILTIN.has(m[1].toLowerCase())) shadowed.add(m[1].toLowerCase());
  const verb = search(SR('_DESCRIPTION_INTERCEPTION_VERB_RE'), clause);
  if (verb) for (const t of clause.slice(verb.index + verb[0].length).match(gx(SR('_DESCRIPTION_COMMAND_TOKEN_RE'), 'g')) || []) if (BUILTIN.has(t.toLowerCase())) shadowed.add(t.toLowerCase());
  for (const m of clause.matchAll(gx(SR('_DESCRIPTION_PASSIVE_INTERCEPTION_RE'), 'g'))) if (BUILTIN.has(m[1].toLowerCase())) shadowed.add(m[1].toLowerCase());
  return [...shadowed].sort();
}

/** TR1-TR3 read the manifest, so they run once, on SKILL.md. Positions are clause numbers, as in SkillSpector. */
export const triggerAbuse = {
  id: 'static_patterns_trigger_abuse',
  analyze(content, file, fileType, ctx, view) {
    if (view || file.toLowerCase() !== 'skill.md') return [];
    const manifest = readFrontmatter(content);
    const triggers = (manifest.triggers || []).map((t) => String(t).trim()).filter(Boolean);
    let clauses = [];
    if (!triggers.length && typeof manifest.description === 'string' && manifest.description.trim()) clauses = descriptionClauses(manifest.description.trim());
    if (!triggers.length && !clauses.length) return [];
    const pass = new Pass(content, file, fileType, CATEGORY.TRIGGER_ABUSE, null);
    const add = (id, msg, sev, conf, n, text) => { const f = pass.addAt(id, msg, sev, 0, null, conf, text, { context: null }); f.line = n; f.pattern = msg.split(':')[0]; return f; };
    const baiting = [/^(?:anything|everything|whatever|always|any\s+(?:question|request|task|input))$/, /^(?:when(?:ever)?|if|every\s+time)\s+(?:the\s+)?user\s+(?:says?|asks?|types?|sends?)\s+(?:anything|something|a\s+message)$/, /^(?:all|any|every)\s+(?:messages?|inputs?|requests?|queries?|questions?)$/];
    triggers.forEach((trigger, idx) => {
      const n = idx + 1, lower = trigger.toLowerCase().trim(), words = lower.split(/\s+/);
      if (words.length === 1 && BROAD.has(lower)) add('TR1', `Overly Broad Trigger: '${trigger}' is a common word that will activate in many unintended contexts`, 'LOW', 0.75, n, trigger);
      else if (lower.length <= 2) add('TR1', `Overly Broad Trigger: '${trigger}' is too short and may match unintended inputs`, 'LOW', 0.7, n, trigger);
      if (BUILTIN.has(lower) || (words.length > 0 && BUILTIN.has(words[0]) && words.length <= 2)) add('TR2', `Shadow Command Trigger: '${trigger}' conflicts with built-in command '${words[0]}'`, 'MEDIUM', 0.7, n, trigger);
      if (baiting.some((re) => re.test(lower))) add('TR3', `Keyword Baiting Trigger: '${trigger}' is designed to match all or most user inputs`, 'MEDIUM', 0.8, n, trigger);
    });
    clauses.forEach((clause, idx) => {
      const n = idx + 1, lower = clause.toLowerCase().trim();
      const pm = search(SR('_DESCRIPTION_TRIGGER_PHRASE_RE'), clause);
      if (pm) {
        const phrase = pm.groups.phrase, pl = phrase.toLowerCase(), pw = pl.split(/\s+/);
        if (pw.length === 1 && BROAD.has(pl)) add('TR1', `Overly Broad Trigger: description clause '${clause}' activates on '${pw[0]}', a common word that will activate in many unintended contexts`, 'LOW', 0.75, n, clause);
        else if (pl.length <= 2) add('TR1', `Overly Broad Trigger: description clause '${clause}' activates on '${phrase}', which is too short and may match unintended inputs`, 'LOW', 0.7, n, clause);
      }
      const shadowed = shadowedCommands(clause);
      if (shadowed.length) add('TR2', `Shadow Command Trigger: description clause '${clause}' conflicts with built-in command '${shadowed[0]}'`, 'MEDIUM', 0.7, n, clause);
      if (conditionHasUniversalScope(clause) || fullmatch(SR('_DESCRIPTION_BARE_SCOPE_RE'), lower)) add('TR3', `Keyword Baiting Trigger: description clause '${clause}' is designed to match all or most user inputs`, 'MEDIUM', 0.8, n, clause);
    });
    return pass.findings;
  },
};

// ============================================================================ system prompt leakage (P6-P8)
const LM = 'static_patterns_system_prompt_leakage';
const P6 = pairs(LM, 'P6_PATTERNS'), P7 = pairs(LM, 'P7_PATTERNS'), P8 = pairs(LM, 'P8_PATTERNS');
const LR = (n) => rxOf(table(LM, n));
const leakageTable = (n) => { try { return LR(n); } catch { return null; } };
function previousNonblank(content, offset) {
  const ws = Math.max(0, offset - 512);
  const parts = content.slice(ws, offset).split(new RegExp(LOGICAL_LINE_BREAK.source, 'g'));
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].trim()) return [parts[i], i > 0 || ws === 0];
  return ['', ws === 0];
}
function nextNonblank(content, offset) {
  const we = Math.min(content.length, offset + 512);
  const win = content.slice(offset, we);
  let cursor = 0; const re = new RegExp(LOGICAL_LINE_BREAK.source, 'g'); let m;
  while ((m = re.exec(win))) { const line = win.slice(cursor, m.index); if (line.trim()) return [line, true]; cursor = m.index + m[0].length; }
  return we === content.length ? [win.slice(cursor), true] : ['', false];
}
function isBenignPrintRulesTaxonomy(content, m) {
  const tax = leakageTable('_BENIGN_PRINT_RULES_TAXONOMY');
  if (!tax) return false;
  const ws = Math.max(0, m.index - 256), we = Math.min(content.length, m.end + 256);
  const g = new RegExp(tax.source, tax.flags.replace(/[gy]/g, '') + 'gd'); g.lastIndex = ws;
  const slice = content.slice(0, we);
  let cand;
  while ((cand = g.exec(slice))) {
    if (!cand[0]) g.lastIndex++;
    const t = cand.indices.groups.target;
    if (!t || t[0] !== m.index || t[1] !== m.end) continue;
    const end = cand.index + cand[0].length;
    const lbRe = new RegExp(LOGICAL_LINE_BREAK.source, 'y'); lbRe.lastIndex = end;
    const lb = lbRe.exec(content);
    if (end !== content.length && !lb) continue;
    if (end !== content.length) {
      const [next, complete] = nextNonblank(content, lb.index + lb[0].length);
      if (!complete) continue;
      const nl = leakageTable('_NEXT_LINE_REFERENCE');
      if (nl && search(nl, next)) continue;
    }
    if (cand.index === 0) return true;
    const [prev, pc] = previousNonblank(content, cand.index);
    if (!pc) return false;
    const pd = leakageTable('_PRECEDING_DIRECTIVE');
    return !(pd && search(pd, prev));
  }
  return false;
}

export const systemPromptLeakage = {
  id: 'static_patterns_system_prompt_leakage',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.SYSTEM_PROMPT_LEAKAGE, view);
    for (const [src, conf] of P6) {
      for (const m of paragraphMatches(src, content, FLAGS_IM)) {
        if (isDirectlyProhibited(content, m.index, m.end, { allowedTail: PROMPT_REVEAL_TAIL(), allowYaraContinuation: !view })) continue;
        if (isBenignPrintRulesTaxonomy(content, m)) continue;
        pass.add('P6', 'Direct Prompt Extraction', 'HIGH', m, conf);
      }
    }
    for (const [src, conf] of P7) for (const m of paragraphMatches(src, content, FLAGS_IM)) pass.add('P7', 'Indirect Prompt Extraction', 'MEDIUM', m, conf);
    for (const [src, conf] of P8) for (const m of paragraphMatches(src, content, FLAGS_IM)) pass.add('P8', 'Prompt Exfiltration via Tool', 'HIGH', m, conf);
    return pass.findings;
  },
};

// ============================================================================ tool misuse (TM1-TM4)
const TM = 'static_patterns_tool_misuse';
const TT = (n) => table(TM, n);
const TMR = (n) => rxOf(TT(n));
const TM1 = pairs(TM, 'TM1_PATTERNS'), TM1P = pairs(TM, 'TM1_PROSE_PATTERNS');
const TM2 = pairs(TM, 'TM2_PATTERNS'), TM2P = pairs(TM, 'TM2_PROSE_PATTERNS');
const TM3 = pairs(TM, 'TM3_PATTERNS'), TM3P = pairs(TM, 'TM3_PROSE_PATTERNS');
const TM4 = pairs(TM, 'TM4_PATTERNS');
const TM3_SHELL = (() => { try { return pairs(TM, '_TM3_SHELL_PATTERNS'); } catch { return null; } })();
const UMASK_CALL = (() => { try { return table(TM, '_TM3_UMASK_CALL'); } catch { return null; } })();
const HOST_ROOTS = new Set(['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'lib64', 'media', 'mnt', 'opt', 'private', 'proc', 'root', 'run', 'sbin', 'sys', 'tmp', 'users', 'usr', 'var', 'volumes']);
const SAFE_CONTAINER = [/docker\s+run\s+.*--rm/i, /docker\s+run\s+.*-it/i, /docker\s+(?:build|compose|pull|push)\b/i, /podman\s+run\b/i];
const SAFE_DOCKERFILE = [/rm\s+-rf\s+\/var\/lib\/apt\/lists/i, /rm\s+-rf\s+\/var\/cache\/apt/i, /chown\s+-R\s+\w+:\w+\s+\//i, /rm\s+-rf\s+\/root\/\.cache/i];
const DOCKERFILE_CONTEXT = /\b(?:FROM|RUN|WORKDIR|COPY|ADD|ENV|EXPOSE|ENTRYPOINT|CMD|USER|HEALTHCHECK|ARG)\s/;
const REST_ROUTE_LINE = /^[ \t]*(?:[-*#|>~`]+\s*)*`?DELETE\b/;

function isRestRoute(matched, line) {
  if (!matched.startsWith('DELETE')) return false;
  const parts = matched.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const raw = parts.slice(1).join(' ').replace(/^["']+|["']+$/g, '');
  if (!raw.startsWith('/')) return false;
  const segs = raw.split('/').filter(Boolean);
  if (!segs.length) return false;
  if (HOST_ROOTS.has(segs[0].toLowerCase())) return false;
  if (REST_ROUTE_LINE.test(line)) return true;
  if ([':', '{', '}', '?'].some((c) => raw.includes(c))) return true;
  return ['api', 'v1', 'v2', 'v3', 'v4', 'rest', 'graphql', 'auth', 'oauth'].includes(segs[0].toLowerCase());
}
const safeContainer = (t) => SAFE_CONTAINER.some((p) => p.test(t));
const safeDockerfile = (context, matched) => DOCKERFILE_CONTEXT.test(context) && SAFE_DOCKERFILE.some((p) => p.test(matched) || p.test(context));
function safeCacheCleanup(matched) {
  const m = fullmatch(TMR('_SAFE_CACHE_CLEANUP_RE'), matched);
  if (!m) return false;
  const parts = m.groups.path.split('/');
  const idx = parts.map((p) => p.toLowerCase()).indexOf('.cache');
  const cache = parts.slice(idx + 1);
  return cache.length > 0 && !cache.some((p) => ['', '.', '..'].includes(p) || p.includes('*'));
}
function classifyTm1(context, matched, line, confidence, fileType) {
  const safe = safeContainer(context) || safeDockerfile(context, matched) || safeCacheCleanup(line);
  if (safe) return ['LOW', Math.min(confidence, 0.15)];
  return ['HIGH', ['python', 'shell', 'javascript'].includes(fileType) ? Math.min(1.0, confidence + 0.1) : confidence];
}
function isAssignedValue(content, start) {
  let i = start;
  while (i && ' \t\r\n\\('.includes(content[i - 1])) i--;
  if (!i || content[i - 1] !== '=') return false;
  return i < 2 || !'=!<>'.includes(content[i - 2]);
}

export const toolMisuse = {
  id: 'static_patterns_tool_misuse',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.TOOL_MISUSE, view);
    const lines = splitlines(content);
    const contextFor = (offset) => { if (view) return pass.ctx(offset); const [l, c] = pass.pos(offset); return getContextFromLines(lines, l, 3, c); };
    const seen = new Map();
    for (const pair of TM1) {
      for (const m of matchesFor(inPairs(pair, TM1P), pair[0], content, FLAGS_IM)) {
        const lineStart = content.lastIndexOf('\n', m.index - 1) + 1;
        let lineEnd = content.indexOf('\n', m.end); if (lineEnd === -1) lineEnd = content.length;
        const matchedLine = content.slice(lineStart, lineEnd);
        if (isRestRoute(m.text, matchedLine)) continue;
        const context = contextFor(m.index);
        const [sev, adj] = classifyTm1(context, m.text.slice(0, 200), matchedLine, pair[1], fileType);
        const line = pass.pos(m.index)[0];
        const key = `${line}:${createHash('sha256').update(m.text.trim().split(/\s+/).join(' ')).digest('hex')}`;
        const existing = seen.get(key);
        if (existing) { if (adj > existing.confidence) { existing.confidence = adj; existing.severity = sev; } continue; }
        seen.set(key, pass.add('TM1', 'Tool Parameter Abuse', sev, m, adj, { context }));
      }
    }
    for (const pair of TM2) {
      for (const m of matchesFor(inPairs(pair, TM2P), pair[0], content, FLAGS_IM)) {
        const context = contextFor(m.index);
        const safe = safeDockerfile(context, m.text.slice(0, 200));
        pass.add('TM2', 'Chaining Abuse', safe ? 'LOW' : 'HIGH', m, safe ? Math.min(pair[1], 0.15) : pair[1], { context });
      }
    }
    const tm3 = fileType === 'shell' && TM3_SHELL ? TM3_SHELL : TM3;
    for (const pair of tm3) {
      const skipAssigned = UMASK_CALL && pair[0] === UMASK_CALL[0] && pair[1] === UMASK_CALL[1];
      for (const m of matchesFor(inPairs(pair, TM3P), pair[0], content, FLAGS_IM)) {
        if (skipAssigned && isAssignedValue(content, m.index)) continue;
        pass.add('TM3', 'Unsafe Defaults', 'MEDIUM', m, pair[1], { context: contextFor(m.index) });
      }
    }
    const seg = file.replace(/\\/g, '/').split('/');
    const reference = ['markdown', 'text'].includes(fileType) && seg[seg.length - 1].toLowerCase() !== 'skill.md' && seg.length > 1 && seg[0] === 'references';
    const tm4Tags = reference ? [...pass.tags, 'contextual-triage', 'likely-benign-context'] : pass.tags;
    for (const pair of TM4) for (const m of patternMatches(pair[0], content, FLAGS_IM)) pass.add('TM4', 'Privileged Kubernetes Workload', 'HIGH', m, pair[1], { tags: tm4Tags, context: contextFor(m.index) });
    return pass.findings;
  },
};
