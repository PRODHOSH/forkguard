// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Prompt injection: P1 instruction override, P2 hidden instructions, P3 exfiltration commands, P4 behaviour
// manipulation, P9 whitespace padding. Ported from static_patterns_prompt_injection.py in SkillSpector.
import { table, pairs, rxOf, rx, patternMatches, paragraphMatches, PY_I, PY_M, PY_S, LOGICAL_LINE_BREAK } from '../text.js';
import { CATEGORY } from '../engine.js';
import { Pass, FLAGS_IM } from './util.js';
import { detectWhitespacePadding, paddingFingerprint, VERTICAL_HIGH_SEVERITY_LINES, ZERO_WIDTH_CHARS } from './whitespace.js';

const M = 'static_patterns_prompt_injection';
const P1 = pairs(M, 'P1_PATTERNS'), P2 = pairs(M, 'P2_PATTERNS'), P3 = pairs(M, 'P3_PATTERNS'), P4 = pairs(M, 'P4_PATTERNS');
const SINGLE_CHAR = new Set(table(M, '_SINGLE_CHARACTER_P2_PATTERNS'));
const ZERO_WIDTH_PATTERN = table(M, '_ZERO_WIDTH_PATTERN'), BIDI = table(M, '_BIDI_CONTROL_PATTERN');
const REF_PATTERN = table(M, '_REFERENCE_COMMENT_PATTERN');
const R = (n) => rxOf(table(M, n));
const reNoG = (re) => new RegExp(re.source, re.flags.replace('g', ''));
const exec = (re, s, from = 0) => { const g = new RegExp(re.source, re.flags.replace('g', '') + 'g'); g.lastIndex = from; return g.exec(s); };
const full = (re, s) => new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')).exec(s);
const startsAt = (re, s, from = 0) => { const g = new RegExp(re.source, re.flags.replace('g', '') + 'y'); g.lastIndex = from; return g.exec(s); };

const P9_SKIP = table(M, '_P9_SKIP_GLOBS').map((g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'));
const isP9Skipped = (file) => P9_SKIP.some((re) => re.test(file.replace(/\\/g, '/').split('/').pop()));

// ---- P2 structural-benign carve-out: only structurally proven license or metadata comments are exempt.
const LICENSE_LINES = table(M, '_P2_LICENSE_LINE_RES').map((o) => rxOf(o));
const BENIGN_KEYS = new Set(table(M, '_P2_BENIGN_METADATA_KEYS'));
const FREE_TEXT_KEYS = new Set(table(M, '_P2_FREE_TEXT_KEYS'));
const VALUE_RES = Object.fromEntries(Object.entries(table(M, '_P2_METADATA_VALUE_RES')).map(([k, v]) => [k, v.map((o) => rxOf(o))]));
const FRONTMATTER_LIMIT = table(M, '_P2_FRONTMATTER_ADJACENT_LIMIT'), COMMENT_MAX = table(M, '_P2_BENIGN_COMMENT_MAX_LEN');

const triggerScanText = (t) => t.replace(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, ' ').replace(/[0-9_]+/g, ' ').replace(/\s+/g, ' ');

function commentInner(matched) {
  const text = matched.trim();
  if (text.startsWith('<!--')) { let inner = text.slice(4); if (inner.endsWith('-->')) inner = inner.slice(0, -3); return inner; }
  if (text.startsWith('[//]:')) {
    const s = text.indexOf('('), e = text.lastIndexOf(')');
    if (s >= 0 && s < e && text.slice(5, s).trim() === '#') return text.slice(s + 1, e);
    return text;
  }
  return text;
}

function hasDangerSignal(inner) {
  for (const text of new Set([inner, triggerScanText(inner)])) {
    for (const [src] of P1) if (rx(src, PY_I).test(text)) return true;
    if (reNoG(R('_P2_OVERRIDE_EXTRA')).test(text)) return true;
    if (reNoG(R('_P2_EXFIL_STANDALONE')).test(text)) return true;
    if (reNoG(R('_P2_EXFIL_KEYWORD')).test(text) && reNoG(R('_P2_EXTERNAL_DEST')).test(text)) return true;
  }
  return false;
}

function isFrontmatterAdjacent(content, start) {
  if (start > FRONTMATTER_LIMIT) return false;
  const stripped = content.slice(0, start).trim();
  if (!stripped) return true;
  const open = /^---[ \t]*\r?\n/.exec(stripped);
  if (!open) return false;
  const close = /^---\s*$/m;
  const rest = stripped.slice(open[0].length);
  const m = close.exec(rest);
  if (!m) return false;
  return !rest.slice(m.index + m[0].length).trim();
}

const isLicenseOnly = (fragment) => !reNoG(R('_P2_TRIGGER_SUBSTRING')).test(fragment) && LICENSE_LINES.some((re) => startsAt(re, fragment));

function isAllowlistedMetadata(fragment) {
  const m = startsAt(R('_P2_METADATA_LINE'), fragment.trim());
  if (!m) return false;
  const key = m[1].toLowerCase();
  let value = m[2].trim();
  if (value.length > 1 && value.endsWith('.')) value = value.slice(0, -1);
  if (reNoG(R('_P2_TRIGGER_SUBSTRING')).test(value)) return false;
  if (FREE_TEXT_KEYS.has(key)) return startsAt(R('_P2_SINGLE_TOKEN_RE'), value) !== null;
  const validators = VALUE_RES[key];
  if (!validators?.length) return false;
  return validators.some((re) => startsAt(re, value));
}

function isBenignLicenseOrMetadata(inner) {
  const body = inner.trim();
  if (!body) return false;
  const seen = new Set();
  let copyright = 0, spdx = 0, licensed = 0;
  const idx = (n) => table(M, n);
  for (let fragment of body.split(/[.!?]+\s+|\n|;/)) {
    fragment = fragment.trim();
    if (!fragment) continue;
    if (isLicenseOnly(fragment)) {
      if (startsAt(LICENSE_LINES[idx('_P2_COPYRIGHT_LINE_INDEX')], fragment)) { if (++copyright > 2) return false; }
      else if (startsAt(LICENSE_LINES[idx('_P2_SPDX_LINE_INDEX')], fragment)) { if (++spdx > 1) return false; }
      else if (startsAt(LICENSE_LINES[idx('_P2_LICENSED_LINE_INDEX')], fragment)) { if (++licensed > 1) return false; }
      continue;
    }
    const km = startsAt(R('_P2_METADATA_LINE'), fragment);
    if (km) {
      const key = km[1].toLowerCase();
      if (BENIGN_KEYS.has(key)) {
        if (seen.has(key)) return false;
        seen.add(key);
        if (key === 'copyright' && ++copyright > 2) return false;
      }
    }
    if (isAllowlistedMetadata(fragment)) continue;
    return false;
  }
  return true;
}

function isCompleteComment(content, start, end) {
  let lineEnd = content.indexOf('\n', end);
  const tail = lineEnd === -1 ? content.slice(end) : content.slice(end, lineEnd);
  if (tail.trim()) return false;
  const s = content.slice(start, end);
  if (s.startsWith('<!--')) return s.endsWith('-->') && !s.slice(4, -3).includes('-->');
  if (s.startsWith('[//]:')) {
    const open = s.indexOf('(');
    if (open === -1) return false;
    let depth = 0, i = open;
    while (i < s.length) {
      if (s[i] === '\\') { i += 2; continue; }
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { depth--; if (depth === 0) return i === s.length - 1; }
      i++;
    }
    return false;
  }
  return false;
}

function isStructurallyBenignP2(content, start, matched) {
  const stripped = matched.trim();
  if (start > FRONTMATTER_LIMIT) return false;
  if (!(stripped.startsWith('<!--') || stripped.startsWith('[//]:'))) return false;
  if (!isCompleteComment(content, start, start + matched.length)) return false;
  const inner = commentInner(stripped);
  if (hasDangerSignal(inner)) return false;
  if (!isFrontmatterAdjacent(content, start)) return false;
  if (inner.trim().length > COMMENT_MAX) return false;
  return isBenignLicenseOrMetadata(inner);
}

const emojiBase = (ch) => /\p{Extended_Pictographic}/u.test(ch ?? '');
const VARIATION = new Set([0xfe0e, 0xfe0f]);
const isModifier = (code) => code >= 0x1f3fb && code < 0x1f400;
function safeEmojiZwj(content, offset) {
  if (content[offset] !== '‍') return false;
  let i = offset - 1;
  while (i >= 0 && (VARIATION.has(content.charCodeAt(i)) || isModifier(content.codePointAt(i)))) i--;
  if (!(i >= 0 && emojiBase(String.fromCodePoint(content.codePointAt(i)) || content[i]))) return false;
  let j = offset + 1;
  while (j < content.length && VARIATION.has(content.charCodeAt(j))) j++;
  if (j < content.length && isModifier(content.codePointAt(j))) j += 2;
  return j < content.length && emojiBase(String.fromCodePoint(content.codePointAt(j)));
}

// Reference-style comments: `[//]: # (title)`. Port of _reference_comment_matches().
function* referenceComments(content) {
  const opening = R('_REFERENCE_COMMENT_OPENING'), title = R('_REFERENCE_COMMENT_TITLE'), keyword = R('_REFERENCE_COMMENT_KEYWORD');
  let cursor = 0;
  while (cursor < content.length) {
    const open = exec(opening, content, cursor);
    if (!open) return;
    const destStart = open.index + open[0].length - 1;
    let end = open.index + open[0].length, depth = 0;
    while (end < content.length) {
      const ch = content[end];
      if (' \t\r\n'.includes(ch) || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127) break;
      if (ch === '\\' && end + 1 < content.length && '\\()'.includes(content[end + 1])) { end += 2; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      end++;
    }
    const destValid = depth === 0 && (end === content.length || ' \t\r\n'.includes(content[end]));
    const t = destValid ? startsAt(title, content, end) : null;
    if (!t) {
      if (destValid && exec(keyword, content.slice(0, end), destStart)) yield { index: open.index, end, text: content.slice(open.index, end), groups: {} };
      cursor = Math.max(end, open.index + open[0].length);
      continue;
    }
    const titleStart = t.index + t[0].length;
    end = titleStart;
    let closed = false; depth = 0; let lineHasText = true;
    while (end < content.length) {
      const ch = content[end];
      if (ch === '\\' && end + 1 < content.length && '\\()'.includes(content[end + 1])) { end += 2; lineHasText = true; continue; }
      if (ch === '(') { depth++; lineHasText = true; end++; continue; }
      if (ch === ')') { if (depth) { depth--; lineHasText = true; end++; continue; } end++; closed = true; break; }
      if (ch === '\r' || ch === '\n') {
        if (!lineHasText) break;
        lineHasText = false;
        if (ch === '\r' && content[end + 1] === '\n') end++;
      } else if (ch !== ' ' && ch !== '\t') lineHasText = true;
      end++;
    }
    if (exec(keyword, content.slice(0, closed ? end - 1 : end), destStart)) yield { index: open.index, end, text: content.slice(open.index, end), groups: {} };
    cursor = Math.max(end, titleStart);
  }
}

function* p2Matches(content, pattern) {
  if (pattern === REF_PATTERN) { yield* referenceComments(content); return; }
  if (!SINGLE_CHAR.has(pattern)) { yield* patternMatches(pattern, content, PY_I | PY_S); return; }
  const re = rx(pattern, PY_I | PY_S, 'g');
  const breaks = new RegExp(LOGICAL_LINE_BREAK.source, 'g');
  let cursor = 0;
  while (cursor < content.length) {
    re.lastIndex = cursor;
    const m = re.exec(content);
    if (!m) return;
    const index = m.index, end = index + m[0].length;
    if (pattern === ZERO_WIDTH_PATTERN && ((index === 0 && content[0] === '﻿') || safeEmojiZwj(content, index))) { cursor = end; continue; }
    yield { index, end, text: m[0], groups: {} };
    breaks.lastIndex = end;
    const lb = breaks.exec(content);
    if (!lb) return;
    cursor = lb.index + lb[0].length;
  }
}

// Unicode "tag" characters hide ASCII text from readers (invisible, but read by a model).
const TAG_CHAR = /[\u{e0000}-\u{e007f}]/u;
const EMOJI_TAG_SEQUENCE = /\u{1f3f4}[\u{e0030}-\u{e0039}\u{e0061}-\u{e007a}]{2,6}\u{e007f}/gu;
function firstSmuggledTag(content) {
  if (!TAG_CHAR.test(content)) return null;
  const safe = [...content.matchAll(EMOJI_TAG_SEQUENCE)].map((m) => [m.index, m.index + m[0].length]);
  for (let i = 0; i < content.length; i++) {
    const cp = content.codePointAt(i);
    if (cp > 0xffff) { if (cp >= 0xe0000 && cp <= 0xe007f && !safe.some(([a, b]) => a <= i && i < b)) return i; i++; }
  }
  return null;
}
function tagRunFrom(content, offset) {
  let end = offset;
  while (end < content.length) { const cp = content.codePointAt(end); if (cp >= 0xe0000 && cp <= 0xe007f) end += 2; else break; }
  return content.slice(offset, end);
}

export const promptInjection = {
  id: 'static_patterns_prompt_injection',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.PROMPT_INJECTION, view);
    for (const [src, conf] of P1) for (const m of paragraphMatches(src, content, FLAGS_IM)) pass.add('P1', 'Instruction Override', 'HIGH', m, conf, { span: true });

    if (['markdown', 'perl', 'powershell', 'other'].includes(fileType)) {
      for (const [src, conf] of P2) {
        for (const m of p2Matches(content, src)) {
          if (isStructurallyBenignP2(content, m.index, m.text)) continue;
          pass.add('P2', 'Hidden Instructions', 'HIGH', m, conf, { span: true });
        }
      }
    }
    const promptRules = [['P3', 'Exfiltration Commands', 'HIGH', P3], ['P4', 'Behavior Manipulation', 'MEDIUM', P4]];
    for (const [ruleId, message, severity, patterns] of promptRules) {
      for (const [src, conf] of patterns) for (const m of paragraphMatches(src, content, PY_I | PY_M)) pass.add(ruleId, message, severity, m, conf, { span: true });
    }

    const tag = firstSmuggledTag(content);
    if (tag !== null) {
      const run = tagRunFrom(content, tag);
      pass.addAt('P2', 'Hidden Instructions (Unicode Tag / ASCII smuggling)', 'HIGH', tag, tag + run.length, 0.9, run, { matched: JSON.stringify(content.slice(tag, tag + 40)) });
    }
    for (const m of p2Matches(content, BIDI)) pass.add('P2', 'Hidden Instructions', 'HIGH', m, 0.85, { span: true });

    if (!isP9Skipped(file)) {
      for (const run of detectWhitespacePadding(content, fileType)) {
        let confidence, severity;
        if (run.kind === 'vertical') { confidence = run.followedByContent ? 0.8 : 0.6; severity = run.followedByContent && run.length >= VERTICAL_HIGH_SEVERITY_LINES ? 'HIGH' : 'MEDIUM'; }
        else if (run.kind === 'horizontal') { confidence = 0.7; severity = 'MEDIUM'; }
        else if (run.kind === 'repetition') { confidence = 0.8; severity = 'MEDIUM'; }
        else { confidence = 0.4; severity = 'LOW'; }
        const f = pass.addAt('P9', 'Whitespace Padding', severity, run.startOffset, null, confidence, run.summary, { matched: run.summary });
        f.line = pass.index.lineAndColumn(pass.src(run.startOffset))[0];
        f.fingerprint = paddingFingerprint(pass.view ? pass.view.original : content, run);
      }
    }
    return pass.findings;
  },
};

export { ZERO_WIDTH_CHARS };
