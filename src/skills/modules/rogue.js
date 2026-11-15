// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Rogue agent: RA1 self-modification, RA2 session persistence. Port of static_patterns_rogue_agent.py.
import { table, pairs, rxOf, getContextFromLines, splitlines, LOGICAL_LINE_BREAK } from '../text.js';
import { CATEGORY } from '../engine.js';
import { Pass, FLAGS_IM, inPairs, matchesFor } from './util.js';
import { isDirectlyProhibited } from './prohibition.js';

const M = 'static_patterns_rogue_agent';
const T = (n) => table(M, n);
const R = (n) => rxOf(T(n));
const RA1 = pairs(M, 'RA1_PATTERNS'), RA1P = pairs(M, 'RA1_PROSE_PATTERNS');
const RA2 = pairs(M, 'RA2_PATTERNS'), RA2P = pairs(M, 'RA2_PROSE_PATTERNS');
const search = (re, s, from = 0, to = s.length) => { const g = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'g'); g.lastIndex = from; const m = g.exec(s); return m && m.index + m[0].length <= to ? m : null; };
const matchAt = (re, s, from = 0, to = s.length) => { const y = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'y'); y.lastIndex = from; const m = y.exec(s.slice(0, to)); return m; };
const fullmatch = (re, s) => new RegExp(`^(?:${re.source})$`, re.flags.replace(/[gy]/g, '')).exec(s);

function lineMeta(content) {
  const starts = [0], ends = [];
  const re = new RegExp(LOGICAL_LINE_BREAK.source, 'g');
  let m;
  while ((m = re.exec(content))) { ends.push(m.index); starts.push(m.index + m[0].length); }
  ends.push(content.length);
  return { starts, ends };
}
function bounds(meta, offset) {
  let lo = 0, hi = meta.starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (meta.starts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return [meta.starts[lo], meta.ends[lo], lo];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isNegatedSafetyConstraint(content, m, meta) {
  const [ls, le] = bounds(meta, m.index);
  const line = content.slice(ls, le);
  const local = m.index - ls;
  const phrase = line.slice(local, local + m.text.length);
  const escaped = escapeRe(phrase.trim());
  if (!escaped) return false;
  const clauseStart = Math.max(...['.', ';', ':'].map((s) => line.lastIndexOf(s, local - 1)));
  const prefix = line.slice(clauseStart + 1, local);
  const safeGap = '(?:(?:ever|again|directly|intentionally|explicitly|repeatedly|attempt\\s+to|try\\s+to)\\s+){0,2}';
  const pronoun = '(?:it|them|this|that|these|those)', determiner = '(?:the|a|an|this|that|any)';
  const classifier = '(?:processes|utilities|libraries|suites?|tools?|commands?|programs?|scripts?|features?|functions?|methods?|approaches|options?|operations?|systems?|modules?|packages|services|mechanisms|techniques|capabilities|routines?|procedures|instructions?|steps?|binaries|executables|applications|components)';
  const gerund = '(?:running|using|executing|invoking|calling|applying|performing|triggering|starting|launching|enabling|doing)';
  const objectGap = `(?:${determiner}\\s+\\w+\\s+|${pronoun}\\s+|${determiner}\\s+|${classifier}\\s+|${gerund}\\s+)?`;
  const recommendation = `(?:(?:recommend|advise|suggest|propose|encourage|urge)(?:s|d|es|ed|ing)?\\s+${objectGap})?`;
  const negation = "(?:must\\s+not|do\\s+not|don't|never|should\\s+not)\\s+";
  return new RegExp(`${negation}${safeGap}${recommendation}\`?${escaped}$`, 'i').test(prefix + phrase);
}

function enclosingInlineCodeSpan(line, start, end) {
  const delims = [...line.matchAll(/`/g)].map((m) => m.index);
  if (delims.length % 2) return null;
  for (let i = 0; i < delims.length; i += 2) if (delims[i] < start && end <= delims[i + 1]) return [delims[i], delims[i + 1]];
  return null;
}

function stripCliSubjectAffixes(subject) {
  let stem = subject.toLowerCase(), changed = true;
  while (changed) {
    changed = false;
    for (const ext of T('_CLI_EXECUTABLE_EXTENSIONS')) if (stem.endsWith(ext)) { stem = stem.slice(0, -ext.length); changed = true; break; }
    for (const suf of T('_CLI_ROLE_SUFFIXES')) if (stem.length > suf.length && stem.endsWith(suf)) { stem = stem.slice(0, -suf.length); changed = true; break; }
  }
  return stem;
}
function isProtectedUpdateSubject(subject) {
  if (/[^\x00-\x7f]/.test(subject)) return true;
  const stem = stripCliSubjectAffixes(subject);
  const collapsed = stem.replace(/[-_.]/g, '');
  if (T('_NON_COMPANION_UPDATE_SUBJECTS').includes(collapsed) || collapsed.startsWith('python')) return true;
  return stem.split(/[-_.]+/).filter(Boolean).some((p) => T('_PROTECTED_UPDATE_SUBJECT_PARTS').includes(p));
}

function isSignedCompanionUpdate(content, m, fileType, meta) {
  if (!['markdown', 'text'].includes(fileType) || m.text.toLowerCase() !== 'self-update') return false;
  const [ls, le] = bounds(meta, m.index);
  if (le - ls > T('_MAX_COMPANION_UPDATE_LINE_CHARS')) return false;
  const line = content.slice(ls, le);
  const lStart = m.index - ls, lEnd = m.end - ls;
  const span = enclosingInlineCodeSpan(line, lStart, lEnd);
  if (!span) return false;
  const [cs, ce] = span;
  const command = line.slice(cs + 1, ce);
  if (search(R('_SHELL_COMMAND_COMPOSITION'), command)) return false;
  const cms = lStart - cs - 1, cme = lEnd - cs - 1;
  const cli = fullmatch(R('_COMPANION_CLI_BEFORE_SELF_UPDATE'), command.slice(0, cms));
  if (!cli) return false;
  if (isProtectedUpdateSubject(cli.groups.cli.toLowerCase())) return false;
  if (search(R('_DISABLE_SIGNATURE_VERIFICATION'), command)) return false;
  const flag = fullmatch(R('_VERIFY_SIGNATURE_FLAG'), command.slice(cme).trim());
  if (!flag) return false;
  const value = (flag.groups.value || 'true').toLowerCase();
  const clauseStart = Math.max(...'.;!?'.split('').map((c) => line.lastIndexOf(c, cs))) + 1;
  const ends = '.;!?'.split('').map((c) => line.indexOf(c, ce + 1)).filter((p) => p >= 0);
  const clauseEnd = ends.length ? Math.min(...ends) : line.length;
  const evidenceClause = line.slice(clauseStart, clauseEnd);
  const nextCode = line.indexOf('`', ce + 1);
  const negationScope = line.slice(clauseStart, nextCode >= 0 ? nextCode : line.length);
  return ['1', 'on', 'true', 'yes'].includes(value) && search(R('_SIGNED_CLI_RELEASE'), evidenceClause) !== null && search(R('_SIGNED_CLI_RELEASE_NEGATION'), negationScope) === null;
}

function isSimpleSkillClone(line, target) {
  if (search(R('_SHELL_COMMAND_COMPOSITION'), line) || line.includes('`')) return false;
  const tokens = line.trim().split(/\s+/);
  if (tokens.length !== 4 || tokens[0] !== 'git' || tokens[1] !== 'clone') return false;
  if (!fullmatch(R('_CLONE_URL'), tokens[2])) return false;
  const dest = fullmatch(R('_SKILL_INSTALL_PATH'), tokens[3]), created = fullmatch(R('_SKILL_INSTALL_PATH'), target);
  if (!dest || !created) return false;
  const rel = dest.groups.relative, createdRel = created.groups.relative;
  return rel === createdRel || rel.startsWith(`${createdRel}/`);
}

/** Returns null when nearby lines show only a plain skill install, otherwise the evidence match. */
function unsafeSkillInstallContext(content, mkdirLineStart, target, meta) {
  const [, , mkdirIndex] = bounds(meta, mkdirLineStart);
  const radius = T('_MAX_SKILL_INSTALL_CONTEXT_CHARS') >> 1;
  const ctxStart = Math.max(0, mkdirLineStart - radius), ctxEnd = Math.min(content.length, mkdirLineStart + radius);
  const mkdirEvidence = matchAt(R('_SKILL_CONTEXT_LINE'), content, mkdirLineStart, meta.ends[mkdirIndex]);
  const nonWs = R('_NON_WHITESPACE');
  for (const dir of [1, -1]) {
    let i = mkdirIndex + dir;
    while (i >= 0 && i < meta.starts.length) {
      const s = meta.starts[i], e = meta.ends[i];
      if (s >= ctxEnd || e <= ctxStart) {
        const beyond = dir > 0 ? search(nonWs, content, ctxEnd) : search(nonWs, content.slice(0, ctxStart), 0);
        if (beyond) return mkdirEvidence;
        break;
      }
      if (s < ctxStart || e > ctxEnd) return mkdirEvidence;
      const line = content.slice(s, e);
      if (search(R('_SKILLS_ROOT'), line) && !isSimpleSkillClone(line, target)) return matchAt(R('_SKILL_CONTEXT_LINE'), content, s, e);
      i += dir;
    }
  }
  return null;
}

export const rogueAgent = {
  id: 'static_patterns_rogue_agent',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.ROGUE_AGENT, view);
    const meta = lineMeta(content);
    const lines = splitlines(content);
    const contextFor = (offset) => { if (view) return pass.ctx(offset); const [, , idx] = bounds(meta, offset); return getContextFromLines(lines, idx + 1, 3, offset - meta.starts[idx]); };

    for (const pair of RA1) {
      for (const m of matchesFor(inPairs(pair, RA1P), pair[0], content, FLAGS_IM)) {
        const context = contextFor(m.index);
        if (isNegatedSafetyConstraint(content, m, meta)) continue;
        const companion = isSignedCompanionUpdate(content, m, fileType, meta);
        const tags = companion ? [...pass.tags, 'contextual-triage', 'likely-benign-context'] : pass.tags;
        const f = pass.add('RA1', companion ? 'Signed Companion CLI Update' : 'Self-Modification', companion ? 'LOW' : 'HIGH', m, companion ? Math.min(pair[1], 0.15) : pair[1], { context, tags });
        if (companion) {
          f.remediation = 'No skill self-modification change is indicated by this match. Keep signature verification mandatory and identify the companion CLI explicitly.';
          f.explanation = 'The matched phrase is a signed self-update subcommand for a documented companion CLI; it does not direct the skill or agent to rewrite itself.';
        }
      }
    }
    const hiddenDir = T('_HIDDEN_DIRECTORY_WRITE_PATTERN');
    for (const pair of RA2) {
      const prose = inPairs(pair, RA2P);
      for (let m of matchesFor(prose, pair[0], content, FLAGS_IM)) {
        if (prose && isDirectlyProhibited(content, m.index, m.end)) continue;
        if (pair[0] === hiddenDir) {
          const [ls, le] = bounds(meta, m.index);
          const mk = fullmatch(R('_STANDARD_SKILL_MKDIR'), content.slice(ls, le));
          if (mk) {
            const unsafe = unsafeSkillInstallContext(content, ls, mk.groups.target, meta);
            if (unsafe === null) continue;
            m = { index: unsafe.index, end: unsafe.index + unsafe[0].length, text: unsafe[0], groups: {} };
          }
        }
        pass.add('RA2', 'Session Persistence', 'MEDIUM', m, pair[1], { context: contextFor(m.index) });
      }
    }
    return pass.findings;
  },
};
