// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Turns the Python regular expressions in SkillSpector's rule tables into JavaScript ones.
//
// The rule text itself is never edited. Only syntax that Python spells differently is rewritten:
//   (?P<name>..) -> (?<name>..)      (?P=name) -> \k<name>
//   \A -> start of text               \Z -> end of text
//   (?>..) atomic group -> (?:..)     a*+ a++ a?+ possessive -> plain greedy
//   (?i) (?s) (?m) (?x) at the front -> flags
// Python flags (re.I, re.M, re.S, re.X, re.A) become JavaScript flags.

const FLAG_I = 2, FLAG_M = 8, FLAG_S = 16, FLAG_X = 64;

function stripVerbose(src) {
  let out = '', inClass = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') { out += ch + (src[i + 1] ?? ''); i++; continue; }
    if (inClass) { if (ch === ']') inClass = false; out += ch; continue; }
    if (ch === '[') { inClass = true; out += ch; continue; }
    if (ch === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (/\s/.test(ch)) continue;
    out += ch;
  }
  return out;
}

const SYNTAX = new Set('^$\\.*+?()[]{}|/');

// One pass over the pattern, tracking character classes, so escapes are only changed where it is safe.
function rewrite(src, ascii) {
  let out = '', inClass = false;
  const stack = []; // true for a conditional group, closed with `)?`
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      const n = src[i + 1];
      if (n === undefined) { out += '\\\\'; continue; }
      i++;
      if (n === 'A') out += '(?<![\\s\\S])';
      else if (n === 'Z') out += '(?![\\s\\S])';
      else if (n === 'w' && !ascii) out += inClass ? '\\p{L}\\p{N}_' : '[\\p{L}\\p{N}_]';
      else if (n === 'W' && !ascii && !inClass) out += '[^\\p{L}\\p{N}_]';
      else if (n === 'd' && !ascii) out += '\\p{Nd}';
      else if (/[A-Za-z0-9]/.test(n)) out += '\\' + n;
      else if (SYNTAX.has(n)) out += '\\' + n;
      else if (n === '-') out += inClass ? '\\-' : '-';
      else out += n === ' ' || n === '#' ? n : (/\s/.test(n) ? n : n);
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      else if (ch === '[') { out += '\\['; continue; }
      out += ch;
      continue;
    }
    if (ch === '[') { inClass = true; out += ch; if (src[i + 1] === '^') { out += '^'; i++; } if (src[i + 1] === ']') { out += '\\]'; i++; } continue; }
    if (ch === '(' && src[i + 1] === '?' && src[i + 2] === '(') {
      // (?(name)yes) is not in JavaScript. It becomes an optional group, a little more lenient than Python.
      const e = src.indexOf(')', i);
      out += '(?:'; i = e; stack.push(true); continue;
    }
    if (ch === ')') { out += stack.pop() ? ')?' : ')'; continue; }
    if (ch === '(') stack.push(false);
    if (ch === '(' && src[i + 1] === '?') {
      if (src[i + 2] === 'P' && src[i + 3] === '<') { out += '(?<'; i += 3; continue; }
      if (src[i + 2] === 'P' && src[i + 3] === '=') { const e = src.indexOf(')', i); out += '\\k<' + src.slice(i + 4, e) + '>'; i = e; continue; }
      if (src[i + 2] === '>') { out += '(?:'; i += 2; continue; }
    }
    if ((ch === '+') && /[*+?}]/.test(src[i - 1] ?? '') && src[i - 2] !== '\\') continue; // possessive -> greedy
    out += ch;
  }
  return out;
}


// ---- Scoped flags such as (?-i:...) -------------------------------------------------------------------------
// Node 23 and newer understand (?-i:...). Node 18, 20 and 22 do not. For those, a pattern that uses it is turned
// into one that does not need the `i` flag: every ASCII letter outside a case-sensitive group becomes a two-letter
// class, and case-sensitive groups are left as they are. Set FORKGUARD_NO_REGEX_MODIFIERS=1 to force this path.
const SCOPED_FLAGS = /\(\?(?:[a-z]+-?[a-z]*|-[a-z]+):/;
let MODIFIERS = false;
try { new RegExp('(?-i:a)', 'i'); MODIFIERS = process.env.FORKGUARD_NO_REGEX_MODIFIERS !== '1'; } catch { MODIFIERS = false; }

const other = (c) => (c >= 'a' && c <= 'z' ? c.toUpperCase() : c >= 'A' && c <= 'Z' ? c.toLowerCase() : null);

function foldClass(body, ci) {
  if (!ci) return body;
  let out = '';
  const extra = [];
  let i = 0;
  const atom = () => {
    if (body[i] === '\\') {
      let j = i + 2;
      if ((body[i + 1] === 'p' || body[i + 1] === 'P' || body[i + 1] === 'u') && body[i + 2] === '{') j = body.indexOf('}', i) + 1;
      else if (body[i + 1] === 'u') j = i + 6;
      else if (body[i + 1] === 'x') j = i + 4;
      const t = body.slice(i, j); i = j; return { text: t, ch: t.length === 2 ? t[1] : null, escape: true };
    }
    const cp = String.fromCodePoint(body.codePointAt(i)); i += cp.length; return { text: cp, ch: cp, escape: false };
  };
  while (i < body.length) {
    const a = atom();
    out += a.text;
    if (body[i] === '-' && i + 1 < body.length) {
      i++;
      const b = atom();
      out += '-' + b.text;
      if (!a.escape && !b.escape) {
        const lo = a.ch.charCodeAt(0), hi = b.ch.charCodeAt(0);
        const lower = [Math.max(lo, 97), Math.min(hi, 122)], upper = [Math.max(lo, 65), Math.min(hi, 90)];
        if (lower[0] <= lower[1]) extra.push(`${String.fromCharCode(lower[0] - 32)}-${String.fromCharCode(lower[1] - 32)}`);
        if (upper[0] <= upper[1]) extra.push(`${String.fromCharCode(upper[0] + 32)}-${String.fromCharCode(upper[1] + 32)}`);
      }
    } else if (!a.escape && other(a.ch)) extra.push(other(a.ch));
  }
  return out + extra.join('');
}

function foldCase(src, ignore) {
  let out = '';
  const stack = [];
  let ci = ignore;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      let j = i + 2;
      const n = src[i + 1];
      if ((n === 'p' || n === 'P' || n === 'u') && src[i + 2] === '{') j = src.indexOf('}', i) + 1;
      else if (n === 'u') j = i + 6;
      else if (n === 'x') j = i + 4;
      else if (n === 'k' && src[i + 2] === '<') j = src.indexOf('>', i) + 1;
      out += src.slice(i, j); i = j - 1; continue;
    }
    if (ch === '[') {
      let j = i + 1;
      if (src[j] === '^') j++;
      const bodyStart = j;
      while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j += src[j + 1] === 'p' || src[j + 1] === 'P' || src[j + 1] === 'u' && src[j + 2] === '{' ? src.indexOf('}', j) - j + 1 : 2; else j++; }
      out += src.slice(i, bodyStart) + foldClass(src.slice(bodyStart, j), ci) + ']';
      i = j; continue;
    }
    if (ch === '(') {
      const scoped = /^\(\?([a-z]*)(?:-([a-z]*))?:/.exec(src.slice(i, i + 12));
      if (scoped && (scoped[1] || scoped[2])) {
        stack.push(ci);
        if (scoped[2]?.includes('i')) ci = false;
        if (scoped[1].includes('i')) ci = true;
        out += '(?:'; i += scoped[0].length - 1; continue;
      }
      stack.push(ci);
      if (src[i + 1] === '?') {
        const m = /^\(\?(?:<[=!]|[:=!]|<[A-Za-z_]\w*>)/.exec(src.slice(i, i + 40));
        if (m) { out += m[0]; i += m[0].length - 1; continue; }
      }
      out += ch; continue;
    }
    if (ch === ')') { ci = stack.length ? stack.pop() : ci; out += ch; continue; }
    if (ch === '{' && /^\{\d+(?:,\d*)?\}/.test(src.slice(i, i + 12))) { const e = src.indexOf('}', i); out += src.slice(i, e + 1); i = e; continue; }
    if (ci && other(ch)) { out += `[${ch}${other(ch)}]`; continue; }
    out += ch;
  }
  return out;
}

export function convertPattern(src, pyFlags = 0) {
  let flags = '';
  let text = src;
  let verbose = Boolean(pyFlags & FLAG_X);
  let ascii = Boolean(pyFlags & 256);
  let ignore = Boolean(pyFlags & FLAG_I), multi = Boolean(pyFlags & FLAG_M), dot = Boolean(pyFlags & FLAG_S);

  const lead = /^\(\?([aiLmsux]+)\)/.exec(text);
  if (lead) {
    text = text.slice(lead[0].length);
    for (const f of lead[1]) {
      if (f === 'i') ignore = true;
      else if (f === 'm') multi = true;
      else if (f === 's') dot = true;
      else if (f === 'x') verbose = true;
      else if (f === 'a') ascii = true;
    }
  }
  if (verbose) text = stripVerbose(text);

  text = rewrite(text, ascii);
  flags += 'u';
  if (!MODIFIERS && SCOPED_FLAGS.test(text)) { text = foldCase(text, ignore); ignore = false; }
  if (ignore) flags += 'i';
  if (multi) flags += 'm';
  if (dot) flags += 's';
  return { source: text, flags };
}

/** A compiled JavaScript RegExp from a Python pattern. `extra` adds flags such as `g`. */
export function compile(src, pyFlags = 0, extra = '') {
  const { source, flags } = convertPattern(src, pyFlags);
  return new RegExp(source, flags + extra);
}

export const PY = { I: FLAG_I, M: FLAG_M, S: FLAG_S, X: FLAG_X, A: 256 };
