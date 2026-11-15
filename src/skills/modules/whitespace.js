// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// P9, whitespace padding. Port of whitespace_padding.py in SkillSpector.
// Blank lines or long runs of spaces can push hidden instructions off the visible area. This is also how
// PolinRider hides its payload in config files, so the same thresholds are useful for code files.
import { createHash } from 'node:crypto';

export const ZERO_WIDTH_CHARS = new Set(['​', '‌', '‍', '⁠', '﻿']);
const ASCII_CONTROL_PADDING = new Set(['\t', '\n', '\r', '\v', '\f']);
const EXTRA_PADDING = new Set(['\x85', '᠎']);

export const VERTICAL_BLANK_LINES = 20;
export const VERTICAL_HIGH_SEVERITY_LINES = 40;
export const HORIZONTAL_RUN_CHARS = 80;
const BLOCK_BYTE_BUDGET = 2048;
const RATIO_THRESHOLD = 0.9;
const RATIO_MIN_FILE_BYTES = 4096;
const REPEATED_CHAR_THRESHOLD = 512;
const REPEATED_LINE_THRESHOLD = 64;
const REPLACEMENT_DENSITY = 0.3;
const FENCE = /^\s*(```|~~~)/;
const TABLE_DELIMITER_CELL = /^\s*:?-+:?\s*$/;
const LINE_BOUNDARY = /\r\n|\r|\n|\u2028|\u2029|\x85/g;
const SPACE_SEP = /[\p{Zs}\p{Zl}\p{Zp}]/u;

export function isPaddingChar(ch) {
  const code = ch.charCodeAt(0);
  if (code < 0x80) return ch === ' ' || ASCII_CONTROL_PADDING.has(ch);
  if (ZERO_WIDTH_CHARS.has(ch) || EXTRA_PADDING.has(ch)) return true;
  return SPACE_SEP.test(ch);
}
const isBlankLine = (line) => { for (const ch of line) if (!isPaddingChar(ch)) return false; return true; };

const escapes = { '\n': '\\n', '\t': '\\t', '\r': '\\r', '\v': '\\v', '\f': '\\f' };
const escapeForSummary = (ch) => escapes[ch] ?? `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

export function summarizeRun(text) {
  if (!text) return '';
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) || 0) + 1);
  const ordered = [...counts].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0));
  const segs = ordered.slice(0, 3).map(([ch, n]) => `${escapeForSummary(ch)} x${n}`);
  if (ordered.length > 3) segs.push(`+${ordered.length - 3} more`);
  return segs.join(', ');
}

function splitLines(content) {
  const lines = [], offsets = [];
  let pos = 0;
  const re = new RegExp(LINE_BOUNDARY.source, 'g');
  let m;
  while ((m = re.exec(content))) { offsets.push(pos); lines.push(content.slice(pos, m.index)); pos = m.index + m[0].length; }
  offsets.push(pos); lines.push(content.slice(pos));
  offsets.push(content.length);
  return { lines, offsets };
}

const fenceFlags = (lines) => { let inside = false; return lines.map((l) => { if (FENCE.test(l)) { inside = !inside; return true; } return inside; }); };

function tableCells(line) {
  const s = line.trim();
  if (!(s.startsWith('|') && s.endsWith('|'))) return null;
  return s.slice(1, -1).split('|');
}
const pipes = (line) => [...line].map((c, i) => (c === '|' ? i : -1)).filter((i) => i >= 0);

function tableBoundaries(lines) {
  const out = new Map();
  let index = 0;
  while (index + 1 < lines.length) {
    const header = tableCells(lines[index]), delimiter = tableCells(lines[index + 1]);
    if (header && delimiter && header.length === delimiter.length && delimiter.every((c) => TABLE_DELIMITER_CELL.test(c))) {
      const dp = pipes(lines[index + 1]), hp = pipes(lines[index]);
      if (hp.length === dp.length) out.set(index, new Set(hp.filter((p, i) => p === dp[i])));
      index += 2;
      while (index < lines.length) {
        const row = tableCells(lines[index]);
        if (row === null || row.length !== header.length) break;
        const rp = pipes(lines[index]);
        if (rp.length === dp.length) out.set(index, new Set(rp.filter((p, i) => p === dp[i])));
        index++;
      }
      continue;
    }
    index++;
  }
  return out;
}

const run = (kind, startOffset, startLine, length, followedByContent, summary, endOffset = -1) => ({ kind, startOffset, startLine, length, followedByContent, summary, endOffset: endOffset < 0 ? startOffset : endOffset });

function vertical(content, lines, offsets) {
  const runs = [];
  const blank = lines.map(isBlankLine);
  let i = 0;
  while (i < lines.length) {
    if (!blank[i]) { i++; continue; }
    let j = i;
    while (j < lines.length && blank[j]) j++;
    const len = j - i;
    if (len >= VERTICAL_BLANK_LINES) runs.push(run('vertical', offsets[i], i + 1, len, j < lines.length && !blank[j], summarizeRun(content.slice(offsets[i], offsets[j])), offsets[j]));
    i = j;
  }
  return runs;
}

function horizontal(content, lines, offsets, fileType) {
  const runs = [];
  const flags = fileType === 'markdown' ? fenceFlags(lines) : null;
  const boundaries = fileType === 'markdown' ? tableBoundaries(lines) : new Map();
  lines.forEach((line, idx) => {
    if (flags && flags[idx]) return;
    let k = 0;
    while (k < line.length) {
      if (!isPaddingChar(line[k])) { k++; continue; }
      const start = k;
      while (k < line.length && isPaddingChar(line[k])) k++;
      const len = k - start;
      if (len >= HORIZONTAL_RUN_CHARS) {
        if ((boundaries.get(idx) ?? new Set()).has(k) && line.slice(start, k) === ' '.repeat(len)) continue;
        runs.push(run('horizontal', offsets[idx] + start, idx + 1, len, k < line.length, summarizeRun(line.slice(start, k)), offsets[idx] + start + len));
      }
    }
  });
  return runs;
}

const byteLen = (s) => Buffer.byteLength(s, 'utf8');

function blockAndRatio(content) {
  const runs = [];
  let bestBytes = 0, bestStart = -1, bestEnd = -1, i = 0;
  while (i < content.length) {
    if (!isPaddingChar(content[i])) { i++; continue; }
    const start = i;
    while (i < content.length && isPaddingChar(content[i])) i++;
    const b = byteLen(content.slice(start, i));
    if (b > bestBytes) { bestBytes = b; bestStart = start; bestEnd = i; }
  }
  if (bestBytes > BLOCK_BYTE_BUDGET && bestStart >= 0) {
    runs.push(run('block', bestStart, content.slice(0, bestStart).split('\n').length, bestEnd - bestStart, false, summarizeRun(content.slice(bestStart, bestStart + 200)), bestEnd));
  }
  const fileBytes = byteLen(content);
  if (fileBytes > RATIO_MIN_FILE_BYTES) {
    let pad = 0;
    for (const ch of content) if (isPaddingChar(ch)) pad += byteLen(ch);
    if (fileBytes && pad / fileBytes > RATIO_THRESHOLD) runs.push(run('ratio', 0, 1, pad, false, `${pad}/${fileBytes} bytes padding`));
  }
  return runs;
}

function repetition(content) {
  const runs = [];
  let index = 0;
  while (index < content.length) {
    let end = index + 1;
    while (end < content.length && content[end] === content[index]) end++;
    if (end - index >= REPEATED_CHAR_THRESHOLD && !isPaddingChar(content[index])) {
      runs.push(run('repetition', index, content.slice(0, index).split('\n').length, end - index, end < content.length, `repeated U+${content.codePointAt(index).toString(16).toUpperCase().padStart(4, '0')} x${end - index}`, end));
    }
    index = end;
  }
  const { lines, offsets } = splitLines(content);
  index = 0;
  while (index < lines.length) {
    let end = index + 1;
    while (end < lines.length && lines[end] === lines[index] && lines[index].trim()) end++;
    if (end - index >= REPEATED_LINE_THRESHOLD) runs.push(run('repetition', offsets[index], index + 1, end - index, end < lines.length, `repeated line x${end - index}`, offsets[end]));
    index = end;
  }
  return runs;
}

export function detectWhitespacePadding(content, fileType = 'other') {
  if (!content) return [];
  let replacements = 0;
  for (const ch of content) if (ch === '�') replacements++;
  if (replacements / content.length > REPLACEMENT_DENSITY) return [];
  const { lines, offsets } = splitLines(content);
  const v = vertical(content, lines, offsets), h = horizontal(content, lines, offsets, fileType), br = blockAndRatio(content);
  const primary = [...v, ...h];
  const overlaps = (r) => primary.some((p) => r.startOffset < p.endOffset && p.startOffset < r.endOffset);
  const keep = [];
  let blockKept = false;
  for (const r of br) {
    if (r.kind === 'block' && overlaps(r)) continue;
    if (r.kind === 'ratio' && (primary.length || blockKept)) continue;
    if (r.kind === 'block') blockKept = true;
    keep.push(r);
  }
  return [...v, ...h, ...keep, ...repetition(content).filter((r) => !overlaps(r))];
}

/** Hash of one complete padding signal. Matches padding_run_match_fingerprint(). */
export function paddingFingerprint(content, r) {
  const payload = r.startOffset >= 0 && r.startOffset < r.endOffset && r.endOffset <= content.length ? content.slice(r.startOffset, r.endOffset) : content;
  const h = createHash('sha256');
  h.update(Buffer.from('skillspector-padding-run-v1\x00P9\x00', 'utf8'));
  h.update(Buffer.from(r.kind, 'utf8'));
  h.update(Buffer.from('\x00', 'utf8'));
  h.update(Buffer.from(payload, 'utf8'));
  return h.digest('hex');
}
