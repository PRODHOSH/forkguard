// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Privilege escalation (PE1-PE5) and data exfiltration (E1-E5). Ported from static_patterns_privilege_escalation.py
// and static_patterns_data_exfiltration.py in SkillSpector.
// Not ported: the Python syntax-tree checks (constructed credential paths, environment flow tracing) and the
// shell-command proof for E1/E5 downloads. Those only lower or remove findings; here the plain pattern runs.
import { table, pairs, rxOf, getContextFromLines, splitlines, LineIndex, patternMatches, paragraphMatches, LOGICAL_LINE_BREAK } from '../text.js';
import { CATEGORY } from '../engine.js';
import { Pass, FLAGS_IM, inPairs, matchesFor } from './util.js';

// ----------------------------------------------------------------------------- shared regex helpers
const noG = (re) => new RegExp(re.source, re.flags.replace('g', ''));
const search = (re, s, from = 0) => { const g = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'g'); g.lastIndex = from; return g.exec(s); };
const matchAt = (re, s, from = 0) => { const y = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'y'); y.lastIndex = from; return y.exec(s); };
const fullmatch = (re, s) => new RegExp(`^(?:${re.source})$`, re.flags.replace(/[gy]/g, '')).exec(s);

// ============================================================================= privilege escalation
const PM = 'static_patterns_privilege_escalation';
const T = (n) => table(PM, n);
const R = (n) => rxOf(T(n));
const PE1 = pairs(PM, 'PE1_PATTERNS'), PE1P = pairs(PM, 'PE1_PROSE_PATTERNS');
const PE2 = pairs(PM, 'PE2_PATTERNS'), PE2P = pairs(PM, 'PE2_PROSE_PATTERNS');
const PE3 = pairs(PM, 'PE3_PATTERNS'), PE3P = pairs(PM, 'PE3_PROSE_PATTERNS');
const PE4 = pairs(PM, 'PE4_PATTERNS'), PE5 = pairs(PM, 'PE5_PATTERNS');
const MAX_LINE = T('_MAX_CONTEXTUAL_CLASSIFICATION_LINE_CHARS'), MAX_BOUND = T('_MAX_BOUND_TOKEN_CONTEXT_CHARS');
const STORE_WORDS = new Set(T('_PE3_CREDENTIAL_STORE_WORDS'));
const DOC_INDICATORS = ['example:', 'for example', 'e.g.', 'such as', 'documentation', '# warning:', '# note:', '**warning**', '**note**', '```'];
const FENCE_OPEN = /^[ ]{0,3}(`{3,}(?=[^`\r\n]*$)|~{3,})[^\r\n]*$/, FENCE_CLOSE = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/;

const isDocExample = (context, fileType) => ['markdown', 'text'].includes(fileType) && DOC_INDICATORS.some((i) => context.toLowerCase().includes(i));

function lineMeta(content) {
  const starts = [0], ends = [];
  const re = new RegExp(LOGICAL_LINE_BREAK.source, 'g');
  let m;
  while ((m = re.exec(content))) { ends.push(m.index); starts.push(m.index + m[0].length); }
  ends.push(content.length);
  return { starts, ends };
}
function lineBounds(meta, offset) {
  let lo = 0, hi = meta.starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (meta.starts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return [meta.starts[lo], meta.ends[lo], lo];
}

function fenceRanges(content, ignoreOnly = false) {
  const ranges = [];
  let active = null, offset = 0;
  for (const line of content.match(/[^\r\n\v\f\x1c-\x1e\x85\u2028\u2029]*(?:\r\n|[\r\n\v\f\x1c-\x1e\x85\u2028\u2029])|[^\r\n\v\f\x1c-\x1e\x85\u2028\u2029]+/g) || []) {
    const stripped = line.replace(/[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]+$/, '');
    const closing = FENCE_CLOSE.exec(stripped);
    if (active) {
      if (closing && closing[1][0] === active.ch && closing[1].length >= active.len) { if (!ignoreOnly || active.ignore) ranges.push([active.start, offset]); active = null; }
    } else {
      const opening = FENCE_OPEN.exec(stripped);
      if (opening) {
        const info = stripped.slice(opening[0].indexOf(opening[1]) + opening[1].length).trim().split(/\s+/).filter(Boolean);
        active = { ch: opening[1][0], len: opening[1].length, start: offset + line.length, ignore: info.length > 0 && T('_PE3_IGNORE_LIST_FENCE_LANGUAGES').includes(info[0].toLowerCase()) };
      }
    }
    offset += line.length;
  }
  if (active && (!ignoreOnly || active.ignore)) ranges.push([active.start, content.length]);
  return ranges;
}

const isIgnorePatternFile = (file) => { const base = file.replace(/\\/g, '/').split('/').pop(); return T('_PE3_IGNORE_PATTERN_FILE_NAMES').includes(base) || base.endsWith(T('_PE3_IGNORE_PATTERN_FILE_SUFFIX')); };

function isIgnoreFileExclusionEntry(content, m) {
  const start = m.index;
  const searchFrom = Math.max(0, start - MAX_LINE);
  const lineStart = content.lastIndexOf('\n', start - 1) + 1 < searchFrom ? searchFrom : content.lastIndexOf('\n', start - 1) + 1;
  if (lineStart === 0 && searchFrom > 0) return false;
  let lineEnd = content.indexOf('\n', start);
  if (lineEnd < 0 || lineEnd > start + MAX_LINE + 1) lineEnd = lineEnd < 0 ? content.length : lineEnd;
  if (lineEnd - lineStart > MAX_LINE) return false;
  if (lineEnd > lineStart && content[lineEnd - 1] === '\r') lineEnd -= 1;
  const line = content.slice(lineStart, lineEnd);
  const entry = fullmatch(R('_PE3_IGNORE_FILE_ENTRY'), line);
  if (!entry || search(R('_PE3_IGNORE_HOST_PATH'), entry.groups.pattern)) return false;
  const patStart = lineStart + entry[0].indexOf(entry.groups.pattern), patEnd = patStart + entry.groups.pattern.length;
  const matchedEnd = start + m.text.trimEnd().length;
  return patStart <= start && matchedEnd <= patEnd;
}

function hasBoundTokenTransfer(content, m, meta) {
  const [, , idx] = lineBounds(meta, m.index);
  const windowEnd = Math.min(meta.ends[Math.min(idx + 3, meta.ends.length - 1)], m.end + MAX_BOUND);
  const windowStart = meta.starts[idx];
  const win = content.slice(windowStart, windowEnd);
  const ms = m.index - windowStart, me = m.end - windowStart;
  for (const re of [R('_PE3_BOUND_TOKEN_TRANSFER'), R('_PE3_BOUND_TOKEN_RETENTION')]) {
    const g = new RegExp(re.source, re.flags.replace('g', '') + 'g');
    let t;
    while ((t = g.exec(win))) { if (!t[0]) g.lastIndex++; if ((t.index <= ms && ms < t.index + t[0].length) || t.index >= me) return true; }
  }
  return false;
}

function isBareCredentialStoreNoun(content, m, fileType, fences, meta) {
  if (!['markdown', 'text'].includes(fileType)) return false;
  if (!STORE_WORDS.has(m.text.toLowerCase())) return false;
  if (fences.some(([s, e]) => s <= m.index && m.index < e)) return false;
  const [ls, le] = lineBounds(meta, m.index);
  const relStart = Math.max(ls, m.index - 80), relEnd = Math.min(le, m.end + 80);
  const relation = content.slice(relStart, relEnd);
  const nounOffset = m.index - relStart;
  const before = relation.slice(0, nounOffset);
  const sepBefore = [...before.matchAll(/[.,;:](?=\s|$)/g)].map((s) => [s.index, 1]).concat([...before.matchAll(/\b(?:and|then|but|or)\b/g)].map((s) => [s.index, s[0].length]));
  const [clauseStart, prefixLen] = sepBefore.length ? sepBefore.reduce((a, b) => (b[0] > a[0] ? b : a)) : [-1, 0];
  const afterRelation = relation.slice(nounOffset);
  const sepAfter = [...afterRelation.matchAll(/[.,;:](?=\s|$)/g)].map((s) => s.index);
  for (const s of afterRelation.matchAll(/\b(?:and|then|but|or)\b/g)) if (/\b(?:keychain|keyring|gnome-keyring)\b/i.test(afterRelation.slice(s.index + s[0].length))) sepAfter.push(s.index);
  const clauseEnd = sepAfter.length ? nounOffset + Math.min(...sepAfter) : relation.length;
  const clauseStartOffset = clauseStart >= 0 ? clauseStart + prefixLen : 0;
  const clause = relation.slice(clauseStartOffset, clauseEnd);
  const nounStart = nounOffset - clauseStartOffset, nounEnd = nounStart + m.text.length;
  const beforeNoun = clause.slice(0, nounStart), afterNoun = clause.slice(nounEnd);
  const operation = search(R('_PE3_CREDENTIAL_STORE_OPERATION'), beforeNoun);
  const operationAfter = search(R('_PE3_CREDENTIAL_STORE_OPERATION_AFTER'), afterNoun);
  const call = matchAt(R('_PE3_CREDENTIAL_STORE_CALL'), afterNoun);
  // CLI evidence: find-generic-password naming only this noun
  let cli = false;
  const cliM = search(R('_PE3_CREDENTIAL_STORE_CLI'), `${beforeNoun}${m.text}`);
  if (cliM) {
    const args = cliM.groups.args.trimEnd();
    if (args.toLowerCase().endsWith(m.text.toLowerCase())) {
      const argsBefore = args.slice(0, args.length - m.text.length).trimEnd();
      if (!/\b(?:and|then|document|describe|reference|the)\b/i.test(argsBefore)) {
        cli = ![...STORE_WORDS].some((w) => w !== m.text.toLowerCase() && new RegExp(`\\b${w.replace(/[-]/g, '\\-')}\\b`, 'i').test(args));
      }
    }
  }
  const documentation = matchAt(R('_PE3_CREDENTIAL_STORE_DOCUMENTATION'), afterNoun);
  if (documentation) {
    const tail = afterNoun.slice(documentation[0].length);
    const explanatory = /^\s+(?:for|about|with|on|that|which|of)\b/i.test(tail);
    if (!search(R('_PE3_CREDENTIAL_STORE_OPERATION_AFTER'), tail) || explanatory) return true;
  }
  if (fullmatch(R('_PE3_BENIGN_READING_PURPOSE_AFTER'), afterNoun) && !operation && !call && !cli) return true;
  if (!(operation || operationAfter || call || cli)) return true;
  return false;
}

function isAccessTokenDocumentationNoun(content, m, fileType, file, meta, context) {
  if (!['markdown', 'text'].includes(fileType)) return false;
  const text = m.text.toLowerCase();
  if (text !== 'access token' && text !== 'access tokens') return false;
  const [ls, le] = lineBounds(meta, m.index);
  if (le - ls > MAX_LINE) return false;
  const line = content.slice(ls, le);
  const parts = file.replace(/\\/g, '/').toLowerCase().split('/');
  if (!parts.some((p) => T('_PE3_TOKEN_DOCUMENTATION_DIRS').includes(p))) return false;
  if (search(R('_PE3_TOKEN_ACTION_CONTEXT'), context) || search(R('_PE3_TOKEN_SENSITIVE_SOURCE'), context) || hasBoundTokenTransfer(content, m, meta)) return false;
  const relStart = m.index - ls, relEnd = m.end - ls;
  const prefix = line.slice(0, relStart).replace(R('_MARKDOWN_LINE_PREFIX'), '');
  const suffix = line.slice(relEnd);
  const cellPrefix = prefix.split('|').pop();
  const clauseStart = Math.max(...['.', ';', ':'].map((s) => cellPrefix.lastIndexOf(s)));
  const clausePrefix = cellPrefix.slice(clauseStart + 1);
  const directive = R('_PE3_ACCESS_TOKEN_DIRECTIVE_PREFIX');
  if (search(directive, cellPrefix) || search(directive, clausePrefix)) return false;
  if (text === 'access token') return true;
  if (!clausePrefix.trim()) return matchAt(R('_PE3_ACCESS_TOKEN_NOUN_SUFFIX'), suffix) !== null;
  return true;
}

function isCompanionOauthResultNoun(content, m, fileType, meta, context) {
  if (!['markdown', 'text'].includes(fileType) || m.text.toLowerCase() !== 'access token') return false;
  const [ls, le] = lineBounds(meta, m.index);
  if (le - ls > MAX_LINE) return false;
  const line = content.slice(ls, le);
  const prefix = line.slice(0, m.index - ls);
  const clausePrefix = prefix.slice(Math.max(...['.', ';', ':', '|'].map((s) => prefix.lastIndexOf(s))) + 1);
  const cli = search(R('_PE3_COMPANION_CLI_CONTEXT'), clausePrefix), oauth = search(R('_PE3_OAUTH_PROTOCOL_CONTEXT'), clausePrefix), result = search(R('_PE3_OAUTH_RESULT_CONTEXT'), clausePrefix);
  if (!cli || !oauth || !result) return false;
  const ownerEnd = Math.max(cli.index + cli[0].length, oauth.index + oauth[0].length);
  const bridge = clausePrefix.slice(ownerEnd, result.index);
  const suffix = line.slice(m.end - ls);
  const cliPrefix = clausePrefix.slice(0, cli.index);
  if (result.index < ownerEnd || search(R('_PE3_OAUTH_CAUSATIVE_PREFIX'), cliPrefix) || T('_PE3_OAUTH_BARE_RESULT_VERBS').includes(result.groups.verb.toLowerCase()) || !fullmatch(R('_PE3_OAUTH_OWNER_BRIDGE'), bridge) || !fullmatch(R('_PE3_OAUTH_RESULT_SUFFIX'), suffix)) return false;
  return !(search(R('_PE3_TOKEN_ACTION_CONTEXT'), context) || search(R('_PE3_TOKEN_SENSITIVE_SOURCE'), context) || hasBoundTokenTransfer(content, m, meta));
}

function isPe3Documentation(content, m, fileType, file, meta, context) {
  if (!['markdown', 'text'].includes(fileType)) return false;
  if (!['access token', 'access tokens'].includes(m.text.toLowerCase())) return false;
  const [ls, le] = lineBounds(meta, m.index);
  if (le - ls > MAX_LINE) return false;
  const line = content.slice(ls, le);
  const nav = search(R('_PE3_SAFE_ACCESS_TOKEN_NAVIGATION'), line);
  if (nav) {
    const tStart = nav.index + nav[0].indexOf(nav.groups.target), tEnd = tStart + nav.groups.target.length;
    if (tStart === m.index - ls && tEnd === m.end - ls) return true;
  }
  return isAccessTokenDocumentationNoun(content, m, fileType, file, meta, context);
}

function isCredentialTypeDisclosureLabel(content, m, fileType, meta) {
  if (fileType !== 'markdown') return false;
  if (!fullmatch(R('_PE3_CREDENTIAL_TYPE_NOUN'), m.text)) return false;
  const [ls, le] = lineBounds(meta, m.index);
  if (le - ls > MAX_LINE) return false;
  const field = fullmatch(R('_PE3_CREDENTIAL_TYPE_FIELD'), content.slice(ls, le));
  if (!field) return false;
  const vStart = ls + field[0].indexOf(field.groups.value), vEnd = vStart + field.groups.value.length;
  if (!(vStart <= m.index && m.end <= vEnd)) return false;
  const actions = field.groups.value.replace(new RegExp(R('_PE3_CREDENTIAL_TYPE_NON_ACTION_COMPOUND').source, 'giu'), (x) => ' '.repeat(x.length));
  return !(search(R('_PE3_CREDENTIAL_TYPE_ACTION'), actions) || search(R('_PE3_TOKEN_ACTION_CONTEXT'), actions) || search(R('_PE3_TOKEN_SENSITIVE_SOURCE'), actions));
}

function isQualifiedBenignAccessRequirement(content, m, fileType) {
  if (fileType !== 'markdown' || m.text !== 'access credential') return false;
  const lines = splitlines(content);
  const row = new LineIndex(content).line(m.index) - 1;
  if (row >= lines.length || !T('_BENIGN_ACCESS_REQUIREMENT_ROWS').includes(lines[row].trim())) return false;
  let ts = row;
  while (ts > 0 && lines[ts - 1].trim().startsWith('|')) ts--;
  if (ts + 1 >= lines.length) return false;
  if (lines[ts].trim() !== '| Requirement | Purpose |') return false;
  if (lines[ts + 1].trim() !== '| --- | --- |') return false;
  let h = ts - 1;
  while (h >= 0 && !lines[h].trim()) h--;
  return h >= 0 && lines[h].trim() === '## Access Requirements';
}

function isReadOnlyPasswdVolume(content, m) {
  if (m.text.toLowerCase() !== '/etc/passwd') return false;
  const re = new RegExp(R('_READ_ONLY_PASSWD_VOLUME').source, R('_READ_ONLY_PASSWD_VOLUME').flags.replace('g', '') + 'gd');
  let v;
  while ((v = re.exec(content))) {
    const [ss, se] = v.indices.groups.source ?? [-1, -1], [ts, te] = v.indices.groups.target ?? [-1, -1];
    if ((ss <= m.index && m.end <= se) || (ts <= m.index && m.end <= te)) return true;
    if (!v[0]) re.lastIndex++;
  }
  return false;
}

function isNegatedSafetyConstraint(content, m, meta) {
  const [ls, le] = lineBounds(meta, m.index);
  if (le - ls > MAX_LINE) return false;
  const line = content.slice(ls, le);
  const local = m.index - ls;
  const phrase = line.slice(local, local + m.text.length);
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  const clauseStart = Math.max(...['.', ';', ':'].map((s) => line.lastIndexOf(s, local - 1)));
  const prefix = line.slice(clauseStart + 1, local);
  const gap = '(?:(?:ever|again|directly|intentionally|explicitly|attempt\\s+to|try\\s+to)\\s+){0,2}';
  const neg = "(?:must\\s+not|do\\s+not|don't|never|should\\s+not)\\s+";
  return new RegExp(`${neg}${gap}${escaped}$`, 'i').test(prefix + phrase);
}

export const privilegeEscalation = {
  id: 'static_patterns_privilege_escalation',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.PRIVILEGE_ESCALATION, view);
    const meta = lineMeta(content);
    const lines = splitlines(content);
    const docFence = ['markdown', 'text'].includes(fileType) ? fenceRanges(content) : null;
    const ignoreFences = ['markdown', 'text'].includes(fileType) ? fenceRanges(content, true) : [];
    const ignoreFile = isIgnorePatternFile(file);
    const refMaterial = fileType && ['markdown', 'text'].includes(fileType) && (() => { const seg = file.replace(/\\/g, '/').split('/'); return seg[seg.length - 1].toLowerCase() !== 'skill.md' && seg.length > 1 && seg[0] === 'references'; })();
    const ctxAt = (offset) => { const [line, col] = pass.pos(offset); return getContextFromLines(lines, line, 3, col); };
    // when scanning the normalised view, positions map back to the original text; context is taken from there
    const contextFor = (m) => (view ? pass.ctx(m.index) : ctxAt(m.index));

    for (const pair of PE1) for (const m of matchesFor(inPairs(pair, PE1P), pair[0], content, FLAGS_IM)) pass.add('PE1', 'Excessive Permissions', 'LOW', m, pair[1], { context: contextFor(m) });
    for (const pair of PE2) {
      for (const m of matchesFor(inPairs(pair, PE2P), pair[0], content, FLAGS_IM)) {
        const context = contextFor(m);
        const tags = isDocExample(context, fileType) ? [...pass.tags, 'contextual-triage', 'likely-benign-context'] : pass.tags;
        pass.add('PE2', 'Sudo/Root Execution', 'MEDIUM', m, pair[1], { context, tags });
      }
    }
    for (const pair of PE3) {
      for (const m of matchesFor(inPairs(pair, PE3P), pair[0], content, FLAGS_IM)) {
        if (isBareCredentialStoreNoun(content, m, fileType, docFence ?? [], meta)) continue;
        const inIgnoreList = ignoreFile || ignoreFences.some(([s, e]) => s <= m.index && m.index < e);
        if (inIgnoreList && isIgnoreFileExclusionEntry(content, m)) continue;
        if (isCredentialTypeDisclosureLabel(content, m, fileType, meta)) continue;
        const context = contextFor(m);
        const tokenDoc = isPe3Documentation(content, m, fileType, file, meta, context);
        const oauth = isCompanionOauthResultNoun(content, m, fileType, meta, context);
        const contextual = tokenDoc || oauth || isQualifiedBenignAccessRequirement(content, m, fileType) || isReadOnlyPasswdVolume(content, m) || isNegatedSafetyConstraint(content, m, meta);
        const tags = contextual ? [...pass.tags, 'contextual-triage', 'likely-benign-context'] : pass.tags;
        let explanation = null;
        if (oauth) explanation = search(R('_PE3_OAUTH_PROTOCOL_CONTEXT'), context)
          ? 'The matched phrase names an OAuth access-token value in documentation; no instruction to read, copy, or transmit stored credentials was matched.'
          : 'The matched phrase is an access-token label in documentation; no instruction to read, copy, or transmit stored credentials was matched.';
        const f = pass.add('PE3', oauth ? 'OAuth Token Documentation' : 'Credential Access', oauth ? 'LOW' : 'HIGH', m, oauth ? Math.min(pair[1], 0.15) : pair[1], { context, tags });
        if (oauth) f.remediation = 'No credential-access change is indicated by this match. Keep the OAuth flow and token scope explicit, and review separately if the skill reads or transmits stored tokens.';
        if (explanation) f.explanation = explanation;
      }
    }
    const best = (rule, message, patterns, extraTag) => {
      const byLine = new Map();
      for (const pair of patterns) {
        for (const m of patternMatches(pair[0], content, FLAGS_IM)) {
          const line = pass.pos(m.index)[0];
          const context = contextFor(m);
          const tags = (extraTag ? extraTag(context) : isDocExample(context, fileType)) ? [...pass.tags, 'contextual-triage', 'likely-benign-context'] : pass.tags;
          const prev = byLine.get(line);
          if (prev && prev.confidence >= pair[1]) continue;
          // build and replace so the best confidence per line is kept
          const before = pass.findings.length;
          const f = pass.add(rule, message, 'HIGH', m, pair[1], { context, tags });
          pass.findings.length = before; // remove, store separately
          byLine.set(line, f);
        }
      }
      pass.findings.push(...byLine.values());
    };
    best('PE4', 'Docker Socket Access', PE4, null);
    best('PE5', 'Privileged Container / Container Escape', PE5, (context) => refMaterial || isDocExample(context, fileType));
    return pass.findings;
  },
};

// ============================================================================= data exfiltration
const EM = 'static_patterns_data_exfiltration';
const E1 = pairs(EM, 'E1_PATTERNS'), E1P = pairs(EM, 'E1_PROSE_PATTERNS');
const E2 = pairs(EM, 'E2_PATTERNS'), E2P = pairs(EM, 'E2_PROSE_PATTERNS');
const E3 = pairs(EM, 'E3_PATTERNS'), E3P = pairs(EM, 'E3_PROSE_PATTERNS');
const E4 = pairs(EM, 'E4_PATTERNS'), E5 = pairs(EM, 'E5_PATTERNS');

export const dataExfiltration = {
  id: 'static_patterns_data_exfiltration',
  analyze(content, file, fileType, ctx, view) {
    const pass = new Pass(content, file, fileType, CATEGORY.DATA_EXFILTRATION, view);
    for (const pair of E1) {
      for (const m of matchesFor(inPairs(pair, E1P), pair[0], content, FLAGS_IM)) {
        const adj = ['python', 'javascript', 'shell'].includes(fileType) ? Math.min(1.0, pair[1] + 0.1) : pair[1];
        pass.add('E1', 'External Transmission', 'MEDIUM', m, adj);
      }
    }
    for (const pair of E2) for (const m of matchesFor(inPairs(pair, E2P), pair[0], content, FLAGS_IM)) pass.add('E2', 'Env Variable Harvesting', 'HIGH', m, pair[1]);
    for (const pair of E3) for (const m of matchesFor(inPairs(pair, E3P), pair[0], content, FLAGS_IM)) pass.add('E3', 'File System Enumeration', 'MEDIUM', m, pair[1]);
    for (const pair of E4) for (const m of paragraphMatches(pair[0], content, FLAGS_IM)) pass.add('E4', 'Context Leakage', 'HIGH', m, pair[1]);
    for (const pair of E5) for (const m of patternMatches(pair[0], content, FLAGS_IM)) pass.add('E5', 'Cloud Storage Exfiltration', 'MEDIUM', m, pair[1]);
    return pass.findings;
  },
};
