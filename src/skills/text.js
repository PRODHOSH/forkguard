// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Text helpers shared by the skill rules. These follow SkillSpector's own helpers one for one
// (nodes/analyzers/common.py), including its idea of what a line break is.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compile } from './pyregex.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TABLES = JSON.parse(readFileSync(path.join(here, 'data', 'tables.json'), 'utf8'));

/** A table from SkillSpector's source: `table('static_patterns_ssrf', 'SSRF1_PATTERNS')`. */
export function table(moduleName, name) {
  const t = TABLES[moduleName]?.[name];
  if (t === undefined) throw new Error(`missing rule table ${moduleName}.${name}`);
  return t;
}

/** The pattern and confidence pairs of a table, as [source, confidence]. */
export const pairs = (moduleName, name) => table(moduleName, name).map(([src, conf]) => [src, conf]);

const reCache = new Map();
/** A compiled regex from a Python pattern. `extra` is added to the flags, for example `g`. */
export function rx(src, pyFlags = 0, extra = '') {
  const key = `${pyFlags}|${extra}|${src}`;
  let r = reCache.get(key);
  if (!r) { r = compile(src, pyFlags, extra); reCache.set(key, r); }
  r.lastIndex = 0;
  return r;
}

/** A regex object stored in the tables as {__re, flags}. */
export const rxOf = (o, extra = '') => rx(o.__re, o.flags, extra);

export const LOGICAL_LINE_BREAK = new RegExp('\\r\\n|[\\r\\n\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]', 'g');
export const LINE_BREAK_CHARS = '\r\n\v\f\x1c\x1d\x1e\x85\u2028\u2029';
export const MAX_FINDING_CONTEXT_CHARS = 1000;

/** Python's str.splitlines(). */
export function splitlines(s) {
  const out = [];
  let last = 0;
  const re = new RegExp(LOGICAL_LINE_BREAK.source, 'g');
  let m;
  while ((m = re.exec(s))) { out.push(s.slice(last, m.index)); last = m.index + m[0].length; }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function logicalLineStarts(content) {
  const starts = [0];
  const re = new RegExp(LOGICAL_LINE_BREAK.source, 'g');
  let m;
  while ((m = re.exec(content))) starts.push(m.index + m[0].length);
  return starts;
}

/** Maps character offsets to one-based lines and zero-based columns. */
export class LineIndex {
  constructor(content) { this.content = content; this.starts = logicalLineStarts(content); }
  lineAndColumn(offset) {
    const o = Math.min(Math.max(offset, 0), this.content.length);
    let lo = 0, hi = this.starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.starts[mid] <= o) lo = mid; else hi = mid - 1; }
    return [lo + 1, o - this.starts[lo]];
  }
  line(offset) { return this.lineAndColumn(offset)[0]; }
}

function boundedContext(context, anchor) {
  if (context.length <= MAX_FINDING_CONTEXT_CHARS) return context;
  const half = MAX_FINDING_CONTEXT_CHARS >> 1;
  const start = Math.min(Math.max(0, anchor - half), context.length - MAX_FINDING_CONTEXT_CHARS);
  return context.slice(start, start + MAX_FINDING_CONTEXT_CHARS);
}

/** The lines around a match, like get_context() in SkillSpector. */
export function getContext(content, matchStart, contextLines = 3, index) {
  const lines = splitlines(content);
  const idx = index || new LineIndex(content);
  const matchLine = idx.line(matchStart) - 1;
  const startLine = Math.max(0, matchLine - contextLines);
  const endLine = Math.min(lines.length, matchLine + contextLines + 1);
  const selected = lines.slice(startLine, endLine);
  if (!selected.length) return '';
  const rel = Math.min(matchLine - startLine, selected.length - 1);
  const lineStart = content.lastIndexOf('\n', matchStart - 1) + 1;
  const column = Math.min(Math.max(0, matchStart - lineStart), selected[rel].length);
  const anchor = selected.slice(0, rel).reduce((n, l) => n + l.length + 1, 0) + column;
  return boundedContext(selected.join('\n'), anchor);
}

/** Context taken from an array of lines, like get_context_from_lines(). */
export function getContextFromLines(lines, lineno, window = 3, column = 0) {
  const start = Math.max(0, lineno - 1 - window);
  const end = Math.min(lines.length, lineno + window);
  const selected = lines.slice(start, end);
  if (!selected.length) return '';
  const rel = Math.min(Math.max(0, lineno - 1 - start), selected.length - 1);
  const col = Math.min(Math.max(0, column), selected[rel].length);
  const anchor = selected.slice(0, rel).reduce((n, l) => n + l.length + 1, 0) + col;
  const len = selected.reduce((n, l) => n + l.length, 0) + selected.length - 1;
  if (len <= MAX_FINDING_CONTEXT_CHARS) return selected.join('\n');
  const half = MAX_FINDING_CONTEXT_CHARS >> 1;
  const sliceStart = Math.min(Math.max(0, anchor - half), len - MAX_FINDING_CONTEXT_CHARS);
  return selected.join('\n').slice(sliceStart, sliceStart + MAX_FINDING_CONTEXT_CHARS);
}

const CODE_EXAMPLE_INDICATORS = ['```', 'example:', 'for example', 'e.g.', 'such as', 'documentation', '# warning:', '# note:', '**warning**', '**note**', '// ✅', '// ❌', '// good:', '// bad:', '// correct:', '// incorrect:', '// wrong:'];

/** A code example or documentation snippet. SKILL.md is never one: it is the main attack surface. */
export function isCodeExample(context, filePath = '') {
  if (filePath.replace(/\\/g, '/').toLowerCase().endsWith('skill.md')) return false;
  const lower = context.toLowerCase();
  return CODE_EXAMPLE_INDICATORS.some((i) => lower.includes(i));
}

/** Markdown or text under the skill's top-level references/ folder. */
export function isReferenceMaterial(filePath, fileType) {
  if (fileType !== 'markdown' && fileType !== 'text') return false;
  const seg = filePath.replace(/\\/g, '/').split('/');
  if (seg[seg.length - 1].toLowerCase() === 'skill.md') return false;
  return seg.length > 1 && seg[0] === 'references';
}

// Paragraph ranges: text split on two line breaks with only spaces or tabs between them.
const PARAGRAPH_BOUNDARY = new RegExp(`(?:${LOGICAL_LINE_BREAK.source})[ \\t]*(?:${LOGICAL_LINE_BREAK.source})`, 'g');

export function paragraphRanges(content) {
  let start = 0;
  const ranges = [];
  const re = new RegExp(PARAGRAPH_BOUNDARY.source, 'g');
  let m;
  while ((m = re.exec(content))) { ranges.push([start, m.index]); start = m.index + m[0].length; if (m[0].length === 0) re.lastIndex++; }
  if (!ranges.length) return [];
  ranges.push([start, content.length]);
  return ranges;
}

/** Every match of a Python pattern, as plain objects: {index, end, text, groups}. */
export function* patternMatches(src, content, pyFlags = 0, from = 0, to = content.length) {
  const re = rx(src, pyFlags, 'g');
  const text = to === content.length && from === 0 ? content : content.slice(from, to);
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) re.lastIndex++;
    yield { index: m.index + from, end: m.index + from + m[0].length, text: m[0], groups: m.groups || {}, m };
  }
}

/** Prose rules match inside one paragraph at a time, like iter_paragraph_matches(). */
export function* paragraphMatches(src, content, pyFlags = 0) {
  const ranges = paragraphRanges(content);
  if (!ranges.length) { yield* patternMatches(src, content, pyFlags); return; }
  for (const [s, e] of ranges) yield* patternMatches(src, content, pyFlags, s, e);
}

export const PY_I = 2, PY_M = 8, PY_S = 16, PY_A = 256;
