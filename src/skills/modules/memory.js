// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Memory poisoning (MP1-MP3) and output handling (OH1-OH3). Ports of static_patterns_memory_poisoning.py and
// static_patterns_output_handling.py in SkillSpector.
// Not ported from output handling: the JavaScript regexp-literal check and the Python syntax-tree call analysis.
// The subprocess check uses the text pattern SkillSpector falls back to when it cannot parse the file.
import { table, pairs, rx, rxOf, getContextFromLines, splitlines, LOGICAL_LINE_BREAK, patternMatches, paragraphMatches, PY_I, PY_M } from '../text.js';
import { CATEGORY } from '../engine.js';
import { Pass, FLAGS_IM, inPairs, matchesFor } from './util.js';
import { isDirectlyProhibited } from './prohibition.js';

const LB = LOGICAL_LINE_BREAK.source;
const lbRe = () => new RegExp(LB, 'g');
const gx = (re, flags = '') => new RegExp(re.source, re.flags.replace(/[gy]/g, '') + flags);
const searchIn = (re, s, from = 0, to = s.length) => { const g = gx(re, 'g'); g.lastIndex = from; const m = g.exec(s); return m && m.index + m[0].length <= to ? m : null; };
const fullmatch = (re, s) => new RegExp(`^(?:${re.source})$`, re.flags.replace(/[gy]/g, '')).exec(s);
const matchAtPos = (re, s, from) => { const y = gx(re, 'y'); y.lastIndex = from; return y.exec(s); };

// ============================================================================ memory poisoning
const MM = 'static_patterns_memory_poisoning';
const T = (n) => table(MM, n);
const R = (n) => rxOf(T(n));
const MP1 = pairs(MM, 'MP1_PATTERNS'), MP2 = pairs(MM, 'MP2_PATTERNS'), MP2P = pairs(MM, 'MP2_PROSE_PATTERNS'), MP3 = pairs(MM, 'MP3_PATTERNS');
const MP2_CONTENT = pairs(MM, 'MP2_CONTENT_PATTERNS');
const BOUNDED_REP = T('_BOUNDED_REPETITION_PATTERN'), STATE_ADOPTION = T('_MP3_STATE_ADOPTION_PATTERN');
const LAYOUT_RANGES = T('_LAYOUT_CHAR_RANGES'), LAYOUT_ASCII = new Set(T('_LAYOUT_ASCII_CHARS')), MAX_LAYOUT = T('_MAX_LAYOUT_ONLY_SPAN');
const SEPARATORS = new Set(T('_TABLE_SEPARATOR_CHARS'));
const LOGICAL_BREAK = T('_LOGICAL_BREAK') ?? LB;
const TABLE_DELIM_CELL = /^\s*:?-+:?\s*$/;

function* stateAdoptionMatches(content) {
  const pattern = T('_MP3_STATE_ADOPTION_PATTERN');
  const boundary = gx(R('_ADOPTION_PARAGRAPH_BOUNDARY'), 'g');
  let start = 0, b;
  while ((b = boundary.exec(content))) { yield* patternMatches(pattern, content, FLAGS_IM, start, b.index); start = b.index + b[0].length; if (!b[0]) boundary.lastIndex++; }
  yield* patternMatches(pattern, content, FLAGS_IM, start, content.length);
}

function isLayoutOnlySpan(span) {
  if (span.length > MAX_LAYOUT) return false;
  const compact = span.replace(/\s/g, '');
  if (!compact) return true;
  if (/[\p{L}\p{N}]/u.test(compact)) return false;
  for (const ch of compact) {
    if (LAYOUT_ASCII.has(ch)) continue;
    const cp = ch.codePointAt(0);
    if (!LAYOUT_RANGES.some(([s, e]) => s <= cp && cp <= e)) return false;
  }
  return true;
}

function splitUnescapedPipes(text) {
  const segments = []; let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { cur += text.slice(i, i + 2); i++; continue; }
    if (c === '|') { segments.push(cur); cur = ''; } else cur += c;
  }
  segments.push(cur);
  return segments;
}
const tableCells = (line) => { const s = line.trim(); return s.startsWith('|') && s.endsWith('|') ? splitUnescapedPipes(s.slice(1, -1)) : null; };

function tableLineSpans(content) {
  const lines = []; let pos = 0;
  const re = lbRe(); let m;
  while ((m = re.exec(content))) { lines.push([pos, m.index, content.slice(pos, m.index)]); pos = m.index + m[0].length; }
  lines.push([pos, content.length, content.slice(pos)]);
  const spans = [];
  let i = 0;
  while (i + 1 < lines.length) {
    const header = tableCells(lines[i][2]), delim = tableCells(lines[i + 1][2]);
    if (header && delim && header.length === delim.length && delim.every((c) => TABLE_DELIM_CELL.test(c))) {
      spans.push([lines[i][0], lines[i][1]], [lines[i + 1][0], lines[i + 1][1]]);
      let r = i + 2;
      while (r < lines.length) { const row = tableCells(lines[r][2]); if (!row || row.length !== header.length) break; spans.push([lines[r][0], lines[r][1]]); r++; }
      i = r; continue;
    }
    i++;
  }
  return spans;
}
const isTableStructureUnit = (unit) => !!unit && (splitUnescapedPipes(unit).length > 1 || [...unit].every((c) => SEPARATORS.has(c)));
function matchContainsStuffedCell(span) {
  const [src] = MP2_CONTENT[0];
  for (const seg of splitUnescapedPipes(span)) for (const m of patternMatches(src, seg, 0)) if ([...(m.m[1] ?? '')].some((ch) => /[\p{L}\p{N}]/u.test(ch))) return true;
  return false;
}

function previousNonblank(content, offset) {
  const ws = Math.max(0, offset - 512);
  const parts = content.slice(ws, offset).split(lbRe());
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].trim()) return [parts[i], i > 0 || ws === 0];
  return ['', ws === 0];
}
function nextNonblank(content, offset) {
  const we = Math.min(content.length, offset + 512);
  const win = content.slice(offset, we);
  let cursor = 0; const re = lbRe(); let m;
  while ((m = re.exec(win))) { const line = win.slice(cursor, m.index); if (line.trim()) return [line, true]; cursor = m.index + m[0].length; }
  if (we === content.length) return [win.slice(cursor), true];
  return ['', false];
}
const normalizeGuard = (content) => content.split(lbRe()).map((l) => l.replace(/^[ \t]*(?:(?:>|\/\/)[ \t]*)*(?:(?:[-+*]|[0-9]{1,9}[.)])[ \t]+)?(?:#{1,6}[ \t]+)?/, '')).join(' ').replace(/[`*_\[\]]/g, '');
const paragraphSplit = (s) => s.split(new RegExp(`${LOGICAL_BREAK}[ \\t]*${LOGICAL_BREAK}`));

function spanTarget(re, content, from, to, matchSpan) {
  const g = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'gd');
  g.lastIndex = from;
  let c;
  const slice = content.slice(0, to);
  while ((c = g.exec(slice))) {
    if (!c[0]) g.lastIndex++;
    const t = c.indices?.groups?.target;
    if (t && t[0] === matchSpan[0] && t[1] === matchSpan[1]) return c;
  }
  return null;
}

function isBenignResetStateCoverage(content, m) {
  const ws = Math.max(0, m.index - 256), we = Math.min(content.length, m.end + 256);
  const cand = spanTarget(R('_BENIGN_RESET_STATE_COVERAGE'), content, ws, we, [m.index, m.end]);
  if (!cand) return false;
  const end = cand.index + cand[0].length;
  const lb = matchAtPos(new RegExp(LB), content, end);
  if (end !== content.length && !lb) return false;
  if (end !== content.length) {
    const [next, complete] = nextNonblank(content, lb.index + lb[0].length);
    if (!complete) return false;
    if (searchIn(R('_NEXT_LINE_REFERENCE'), next)) return false;
  }
  if (cand.index === 0) return true;
  const [prev, prevComplete] = previousNonblank(content, cand.index);
  if (!prevComplete) return false;
  return searchIn(R('_PRECEDING_DIRECTIVE'), prev) === null;
}

function isBenignHardwareResetState(content, m) {
  if (!/^reset[ \t]+state$/i.test(m.text)) return false;
  const ws = Math.max(0, m.index - 512), we = Math.min(content.length, m.end + 512);
  const pre = [...content.slice(ws, m.index).matchAll(lbRe())];
  const lineStart = pre.length ? ws + pre[pre.length - 1].index + pre[pre.length - 1][0].length : ws;
  const fol = searchIn(new RegExp(LB), content, m.end, we);
  const lineEnd = fol ? fol.index : we;
  if ((!pre.length && ws !== 0) || (!fol && we !== content.length)) return false;
  if (!searchIn(R('_HARDWARE_CLOCK'), content.slice(0, lineEnd), lineStart)) return false;
  if (!spanTarget(R('_HARDWARE_RESET_STATE'), content, lineStart, lineEnd, [m.index, m.end])) return false;
  const [, pc] = previousNonblank(content, lineStart), [, nc] = nextNonblank(content, lineEnd);
  if (!pc || !nc) return false;
  const surrounding = normalizeGuard(content.slice(Math.max(0, lineStart - 512), Math.min(content.length, lineEnd + 512)));
  return !searchIn(R('_HARDWARE_AGENT_REFERENCE'), surrounding) && !searchIn(R('_TIMESTAMP_BACK_REFERENCE'), surrounding);
}

function hasAuthorityHeading(content) {
  const regions = [...content.split(lbRe()), ...paragraphSplit(content)];
  return regions.some((p) => fullmatch(R('_TIMESTAMP_AUTHORITY_HEADING'), normalizeGuard(p).trim()));
}
function hasTimestampBackReference(content, offset) {
  const we = Math.min(content.length, offset + 512);
  const win = content.slice(offset, we);
  const normalized = normalizeGuard(win);
  if (searchIn(R('_TIMESTAMP_BACK_REFERENCE'), normalized) || searchIn(R('_TIMESTAMP_OWNERSHIP_REFERENCE'), normalized) || hasAuthorityHeading(win)) return true;
  if (we !== content.length && !matchAtPos(new RegExp(LB), content, we)) {
    const last = paragraphSplit(win).pop();
    return searchIn(R('_TIMESTAMP_REFERENCE_CUE'), normalizeGuard(last)) !== null;
  }
  return false;
}
function followingContext(content, offset) {
  const we = Math.min(content.length, offset + 512);
  const win = content.slice(offset, we);
  let cursor = 0, closed = false, para = false;
  const re = lbRe(); let m;
  while ((m = re.exec(win))) {
    const line = win.slice(cursor, m.index); cursor = m.index + m[0].length;
    if (closed) {
      if (matchAtPos(R('_CODE_FENCE_MARKER'), line, 0)) return win.slice(0, cursor);
      if (line.trim()) para = true;
      else if (para && we !== content.length) return win.slice(0, cursor);
    }
    if (fullmatch(R('_CODE_FENCE_LINE'), line)) closed = true;
  }
  return we === content.length ? win : null;
}
function isBenignTimestampDescription(content, m) {
  const ws = Math.max(0, m.index - 256), we = Math.min(content.length, m.end + 256);
  const g = new RegExp(R('_TIMESTAMP_CONTEXT_DESCRIPTION').source, R('_TIMESTAMP_CONTEXT_DESCRIPTION').flags.replace(/[gy]/g, '') + 'gd');
  g.lastIndex = ws;
  const slice = content.slice(0, we);
  let cand;
  while ((cand = g.exec(slice))) {
    if (!cand[0]) g.lastIndex++;
    const t = cand.indices.groups.target;
    if (!t || t[0] !== m.index || t[1] !== m.end) continue;
    const cEnd = cand.index + cand[0].length;
    if (cEnd !== content.length && !matchAtPos(new RegExp(LB), content, cEnd)) continue;
    let [prev, prevComplete] = previousNonblank(content, cand.index);
    if (!prevComplete) continue;
    if (fullmatch(R('_CODE_FENCE_OPENER'), prev)) {
      const openerStart = content.lastIndexOf(prev, cand.index);
      [prev, prevComplete] = previousNonblank(content, openerStart);
      if (!prevComplete) continue;
    }
    if (searchIn(R('_PRECEDING_DIRECTIVE'), normalizeGuard(prev))) continue;
    const preceding = content.slice(Math.max(0, cand.index - 512), cand.index);
    const nearest = paragraphSplit(preceding).pop();
    const dir = gx(R('_PRECEDING_DIRECTIVE'), 'g'); let d, bad = false;
    const nn = normalizeGuard(nearest);
    while ((d = dir.exec(nn))) { if (d[0].trim() !== ':') { bad = true; break; } if (!d[0]) dir.lastIndex++; }
    if (bad) continue;
    if (searchIn(R('_TIMESTAMP_DESCRIPTION_DIRECTIVE'), normalizeGuard(preceding)) || hasAuthorityHeading(preceding)) continue;
    const [next, nextComplete] = nextNonblank(content, cEnd);
    const display = nextComplete ? fullmatch(R('_TIMESTAMP_DISPLAY'), next) : null;
    if (!display) continue;
    const fmt = cand.groups.format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(?<!%)${fmt}`).test(display.groups.format_string)) continue;
    if (searchIn(R('_TIMESTAMP_DESCRIPTION_DIRECTIVE'), next) || searchIn(R('_NEXT_LINE_REFERENCE'), next)) continue;
    const displayStart = content.indexOf(next, cEnd);
    const displayEnd = displayStart + next.length;
    if (hasTimestampBackReference(content, displayEnd)) continue;
    const following = followingContext(content, displayEnd);
    if (following === null || searchIn(R('_NEXT_LINE_REFERENCE'), normalizeGuard(following)) || searchIn(R('_TIMESTAMP_DESCRIPTION_DIRECTIVE'), normalizeGuard(following)) || hasAuthorityHeading(following)) continue;
    return true;
  }
  return false;
}

// MP3 write variant: an auto-run file (tests, conftest) that writes to an agent memory file.
const MEMORY_FILES = new Set(T('_AGENT_MEMORY_FILENAMES')), MEMORY_DIRS = new Set(T('_AGENT_MEMORY_DIR_SEGMENTS'));
function isAgentMemoryDestination(raw, prefix = '') {
  const unescaped = prefix.toLowerCase().includes('r') ? raw : raw.replace(/\\([\s\S])/g, '$1');
  const segments = unescaped.replace(/\\/g, '/').trim().split('/').filter((s) => !['', '.', '..'].includes(s));
  if (!segments.length) return false;
  const lowered = segments.map((s) => s.toLowerCase());
  return MEMORY_FILES.has(lowered[lowered.length - 1]) || lowered.some((s) => MEMORY_DIRS.has(s));
}
function* memoryFileWrites(content, fileType) {
  const sinks = fileType === 'python' ? T('_PY_WRITE_SINKS') : ['typescript', 'javascript'].includes(fileType) ? T('_TS_WRITE_SINKS') : [];
  for (const sink of sinks) {
    const re = rxOf(sink, 'g'); re.lastIndex = 0; let m;
    while ((m = re.exec(content))) {
      if (!m[0]) re.lastIndex++;
      const dest = m.groups.dest, prefix = m.groups.prefix || '';
      if (!isAgentMemoryDestination(dest, prefix)) continue;
      if (m.groups.mode !== undefined && ![...m.groups.mode].some((c) => 'wxa+'.includes(c))) continue;
      yield { index: m.index, end: m.index + m[0].length, text: m[0], groups: m.groups, dest };
    }
  }
}

export const memoryPoisoning = {
  id: 'static_patterns_memory_poisoning',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.MEMORY_POISONING, view);
    for (const [src, conf] of MP1) for (const m of paragraphMatches(src, content, FLAGS_IM)) pass.add('MP1', 'Persistent Context Injection', 'MEDIUM', m, conf);
    const tableSpans = fileType === 'markdown' ? tableLineSpans(content) : [];
    for (const pair of MP2) {
      const prose = inPairs(pair, MP2P);
      const iter = pair[0] === BOUNDED_REP ? patternMatches(pair[0], content, FLAGS_IM) : matchesFor(prose, pair[0], content, FLAGS_IM);
      for (const m of iter) {
        const span = m.text;
        if (isLayoutOnlySpan(span)) continue;
        if (!prose && tableSpans.length && tableSpans.some(([s, e]) => s <= m.index && m.index < e) && isTableStructureUnit(m.m[1]) && !matchContainsStuffedCell(span)) continue;
        const chars = new Set(span); for (const c of [' ', '\t', '\n', '\r']) chars.delete(c);
        if (chars.size <= 1 && ![' ', '\t'].some((c) => span.includes(c))) continue;
        pass.add('MP2', 'Context Window Stuffing', 'MEDIUM', m, pair[1]);
      }
    }
    for (const pair of MP3) {
      const adoption = pair[0] === STATE_ADOPTION;
      const iter = adoption ? stateAdoptionMatches(content) : paragraphMatches(pair[0], content, FLAGS_IM);
      for (const m of iter) {
        if (adoption && isDirectlyProhibited(content, m.index, m.end, { allowClausePrefix: true })) continue;
        if (isBenignResetStateCoverage(content, m) || isBenignHardwareResetState(content, m) || isBenignTimestampDescription(content, m)) continue;
        pass.add('MP3', 'Memory Manipulation', 'HIGH', m, pair[1]);
      }
    }
    const base = file.replace(/\\/g, '/').split('/').pop();
    if (['python', 'typescript', 'javascript'].includes(fileType) && fullmatch(R('_AUTO_RUN_CARRIER_RE'), base)) {
      for (const w of memoryFileWrites(content, fileType)) {
        const f = pass.add('MP3', 'Memory Manipulation', 'HIGH', w, 0.85, { evidence: { destination: w.dest, carrier_basename: base, carrier_kind: 'auto_run' } });
        f.remediation = `An auto-run file writes to an agent memory file (${w.dest}). Such writes persist across agent interactions without model involvement. Confirm the destination is intentional and the written content is trusted before installing this skill.`;
      }
    }
    return pass.findings;
  },
};

// ============================================================================ output handling
const OM = 'static_patterns_output_handling';
const OH1 = pairs(OM, 'OH1_PATTERNS'), OH1P = pairs(OM, 'OH1_PROSE_PATTERNS'), OH2 = pairs(OM, 'OH2_PATTERNS'), OH3 = pairs(OM, 'OH3_PATTERNS'), OH3P = pairs(OM, 'OH3_PROSE_PATTERNS');
const SUBPROCESS_FALLBACK = rxOf(table(OM, '_SUBPROCESS_FALLBACK_PATTERN'), 'g');

export const outputHandling = {
  id: 'static_patterns_output_handling',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.OUTPUT_HANDLING, view);
    for (const pair of OH1) {
      for (const m of matchesFor(inPairs(pair, OH1P), pair[0], content, FLAGS_IM)) {
        const adj = ['python', 'javascript', 'shell'].includes(fileType) ? Math.min(1.0, pair[1] + 0.1) : pair[1];
        pass.add('OH1', 'Unvalidated Output Injection', 'HIGH', m, adj);
      }
    }
    const fb = new RegExp(SUBPROCESS_FALLBACK.source, SUBPROCESS_FALLBACK.flags.includes('g') ? SUBPROCESS_FALLBACK.flags : SUBPROCESS_FALLBACK.flags + 'g');
    let m;
    while ((m = fb.exec(content))) { if (!m[0]) fb.lastIndex++; pass.add('OH1', 'Unvalidated Output Injection', 'HIGH', { index: m.index, end: m.index + m[0].length, text: m[0], groups: m.groups || {} }, 0.85); }
    for (const pair of OH2) for (const mm of paragraphMatches(pair[0], content, FLAGS_IM)) pass.add('OH2', 'Cross-Context Output', 'MEDIUM', mm, pair[1]);
    for (const pair of OH3) for (const mm of matchesFor(inPairs(pair, OH3P), pair[0], content, FLAGS_IM)) pass.add('OH3', 'Unbounded Output', 'MEDIUM', mm, pair[1]);
    return pass.findings;
  },
};
