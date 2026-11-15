// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// "Is this action directly forbidden here?" Port of prohibition_context.py in SkillSpector.
// A phrase such as "do not reveal the system prompt" must not be flagged as if it were an instruction to do it.
import { table, rxOf, LINE_BREAK_CHARS, LOGICAL_LINE_BREAK } from '../text.js';
import { normalizedView } from './view.js';

const P = (name, extra = '') => rxOf(table('prohibition_context', name), extra);
const MARKDOWN_CHARS = /[*_`]/g;

export const PROMPT_REVEAL_TAIL = () => P('PROMPT_REVEAL_TAIL');

const lineBreakRe = new RegExp(LOGICAL_LINE_BREAK.source, 'g');
const count = (s, chars) => { let n = 0; for (const c of s) if (chars.includes(c)) n++; return n; };

function lastSplitPiece(re, text) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let last = 0, m;
  while ((m = g.exec(text))) { last = m.index + m[0].length; if (m[0].length === 0) g.lastIndex++; }
  return text.slice(last);
}

function fullmatch(re, text) {
  const r = new RegExp(`^(?:${re.source})$`, re.flags.replace('g', ''));
  return r.exec(text);
}

/**
 * Whether a bounded, unambiguous prohibition governs the exact action at [start, end).
 * Options: allowedTail (a RegExp the leftover object must fully match), allowYaraContinuation, allowClausePrefix.
 */
export function isDirectlyProhibited(content, start, end, { allowedTail = null, allowYaraContinuation = false, allowClausePrefix = false } = {}) {
  const CONTEXT = 512;
  if (!(start >= 0 && start < end && end <= content.length)) return false;
  const left = Math.max(0, start - CONTEXT);
  let prefix = content.slice(left, start).replace(MARKDOWN_CHARS, '');
  const direct = P('_DIRECT_PREFIX');
  const search = (re, text) => { const r = new RegExp(re.source, re.flags.replace('g', '')); return r.exec(text); };
  let prohibited = search(direct, prefix);
  if (allowClausePrefix) {
    const boundary = Math.max(prefix.lastIndexOf(':'), prefix.lastIndexOf(','));
    if (boundary >= 0 && fullmatch(direct, prefix.slice(boundary + 1))) {
      const preceding = lastSplitPiece(P('_CLAUSE_PREFIX_BREAK'), prefix.slice(0, boundary));
      const scopeView = preceding.replace(P('_CLAUSE_MARKDOWN_PREFIX'), '');
      if (!scopeView || !/\p{L}/u.test(scopeView[0]) || search(P('_CLAUSE_PREFIX_QUALIFIER'), scopeView)) return false;
      prefix = prefix.slice(0, boundary) + ';' + prefix.slice(boundary + 1);
      prohibited = search(direct, prefix);
    }
  }
  if (prohibited === null || (left && prohibited.index === 0)) return false;
  const leading = prefix.slice(0, prohibited.index);
  const quoted = leading.replace(new RegExp(P('_CONTRACTION').source, 'gu'), '');
  if (count(quoted, '"“”') % 2) return false;
  if (count(quoted, "'‘’") % 2) return false;
  if (search(P('_DISAVOWAL'), leading)) return false;
  if (search(P('_LEADING_QUALIFIER'), lastSplitPiece(P('_CLAUSE_BREAK'), leading))) return false;
  const negation = prohibited.groups?.negation ?? '';
  if (negation.toLowerCase() === 'no' && leading.trimEnd().endsWith('?')) return false;
  if (search(P('_BLANK_LINE'), prohibited[0].replace(lineBreakRe, '\n'))) return false;

  const rawTail = content.slice(end, end + CONTEXT);
  const tailView = normalizedView(rawTail);
  const tail = tailView.text;
  if (search(P('_DISAVOWAL'), tail) || search(P('_REFERENTIAL_ACTION'), tail)) return false;
  const boundary = search(P('_SENTENCE_END'), tail);
  if (boundary === null && end + rawTail.length < content.length) return false;
  if (boundary !== null) {
    const boundaryEnd = boundary.index + boundary[0].length;
    const followingStart = boundaryEnd < tail.length ? (tailView.offsets[Math.min(boundaryEnd, tailView.offsets.length - 1)] ?? rawTail.length) : rawTail.length;
    let following = rawTail.slice(followingStart).trimStart();
    following = following.replace(new RegExp(`^(?:${P('_LIST_PREFIX').source})`, P('_LIST_PREFIX').flags), '');
    const independent = following ? new RegExp(`^(?:${P('_NEXT_INSTRUCTION').source})`, P('_NEXT_INSTRUCTION').flags.replace('g', '')).exec(following) : null;
    if (following && independent === null) return false;
    if (independent !== null && independent.groups?.yara_reveal !== undefined) {
      const ctx = content.slice(left, end + CONTEXT);
      if (!allowYaraContinuation || search(P('_YARA_AGENT_CONTEXT'), ctx) === null) return false;
    }
  }
  const clause = boundary !== null ? tail.slice(0, boundary.index) : tail;
  if (search(P('_EXCEPTION'), clause)) return false;
  const clean = clause.replace(MARKDOWN_CHARS, '').trim().replace(/[\])}]+$/, '').trimEnd();
  return !clean || (allowedTail !== null && fullmatch(allowedTail, clean) !== null);
}

export { LINE_BREAK_CHARS };
