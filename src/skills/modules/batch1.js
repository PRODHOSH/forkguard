// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// SSRF, deserialization, harmful content, agent snooping, excessive agency, anti-refusal.
// Ported from SkillSpector's static_patterns_*.py files of the same names. Rule text, confidences, severities
// and messages come from the extracted tables; the checks around them are written out here.
import { table, pairs, rx, rxOf, getContext, getContextFromLines, splitlines, isCodeExample, PY_I, PY_M, PY_S, LineIndex, patternMatches, paragraphMatches } from '../text.js';
import { dedupeAnalyzer, CATEGORY } from '../engine.js';
import { Pass, FLAGS_IM, inPairs, matchesFor } from './util.js';
import { isDirectlyProhibited } from './prohibition.js';

const T = (mod) => (name) => table(mod, name);

// ---------------------------------------------------------------- SSRF
const ssrf = (() => {
  const t = T('static_patterns_ssrf');
  const SSRF1 = pairs('static_patterns_ssrf', 'SSRF1_PATTERNS'), SSRF1_PROSE = pairs('static_patterns_ssrf', 'SSRF1_PROSE_PATTERNS');
  const SSRF2 = pairs('static_patterns_ssrf', 'SSRF2_PATTERNS'), SSRF3 = pairs('static_patterns_ssrf', 'SSRF3_PATTERNS');
  const defenseCtx = rxOf(t('_SSRF_DEFENSE_CONTEXT_RE')), defensiveReq = rxOf(t('_DEFENSIVE_REQUEST_RE')), issuer = rxOf(t('_REQUEST_ISSUER_RE'));
  const test = (re, s) => new RegExp(re.source, re.flags.replace('g', '')).test(s);

  function isDefensive(content, m, pass) {
    const lineStart = content.lastIndexOf('\n', m.index - 1) + 1;
    let lineEnd = content.indexOf('\n', m.end);
    if (lineEnd === -1) lineEnd = content.length;
    const line = content.slice(lineStart, lineEnd);
    if (test(defensiveReq, line)) return true;
    if (test(issuer, line)) return false;
    return test(defenseCtx, getContext(content, m.index, 5, pass.index));
  }

  return {
    id: 'static_patterns_ssrf',
    analyze(content, file, fileType, ctx, view) {
      const pass = new Pass(content, file, fileType, CATEGORY.SSRF, view);
      const add = (ruleId, message, severity, list) => {
        for (const pair of list) {
          for (const m of matchesFor(inPairs(pair, SSRF1_PROSE), pair[0], content, FLAGS_IM)) {
            if (ruleId === 'SSRF1' && isDefensive(content, m, pass)) continue;
            pass.add(ruleId, message, severity, m, pair[1]);
          }
        }
      };
      add('SSRF1', 'Cloud Metadata Access', 'HIGH', SSRF1);
      add('SSRF2', 'Internal Network Request', 'MEDIUM', SSRF2);
      add('SSRF3', 'Dynamic Request Target', 'MEDIUM', SSRF3);
      return pass.findings;
    },
  };
})();

// ---------------------------------------------------------------- deserialization
const deserialization = (() => {
  const M = 'static_patterns_deserialization';
  const LANG_BY_EXT = table(M, '_LANG_BY_EXT');
  const RULES = table(M, '_LANG_RULES');
  return {
    id: 'static_patterns_deserialization',
    analyze(content, file, fileType, ctx, view) {
      const dot = file.lastIndexOf('.');
      const language = dot < 0 ? null : LANG_BY_EXT[file.slice(dot).toLowerCase()];
      if (!language) return [];
      const pass = new Pass(content, file, fileType, CATEGORY.DESERIALIZATION, view);
      for (const [ruleId, message, severity, patterns] of RULES[language]) {
        for (const [src, confidence] of patterns) {
          for (const m of patternMatches(src, content, PY_I)) pass.add(ruleId, message, severity, m, confidence);
        }
      }
      return pass.findings;
    },
  };
})();

// ---------------------------------------------------------------- harmful content (P5)
const harmful = (() => {
  const M = 'static_patterns_harmful_content';
  const ACTIONS = pairs(M, 'DANGEROUS_ACTIONS'), SUBSTANCES = pairs(M, 'SUBSTANCE_PATTERNS');
  const instructional = ['step ', 'recipe', 'ingredient', 'add ', 'mix ', 'stir ', 'instructions', 'how to', 'directions', 'prepare', 'cook', 'bake'];
  const educational = ['history of', 'discovered by', 'chemical compound', 'periodic table', 'forensic', 'detective', 'mystery', 'agatha christie', 'toxicology', 'poison control', 'symptoms of', 'treatment for', 'antidote', 'emergency', 'call 911', 'warning', 'danger', 'never', 'do not'];
  const warning = [/do\s+not/, /never\s+(?:use|add|consume|eat|drink)/, /warning/, /danger/, /toxic/, /lethal/, /deadly/, /fatal/, /avoid/, /keep\s+away/];
  return {
    id: 'static_patterns_harmful_content',
    analyze(content, file, fileType, ctx, view) {
      const pass = new Pass(content, file, fileType, CATEGORY.PROMPT_INJECTION, view);
      for (const [src, conf] of ACTIONS) {
        for (const m of paragraphMatches(src, content, PY_I | PY_M | PY_S)) pass.add('P5', 'Harmful Content Injection', 'CRITICAL', m, conf, { span: true, context: pass.ctx(m.index, 5) });
      }
      for (const [src, base] of SUBSTANCES) {
        for (const m of patternMatches(src, content, PY_I)) {
          const context = pass.ctx(m.index, 5);
          let confidence = base;
          const around = content.slice(Math.max(0, m.index - 250), Math.min(content.length, m.index + 250)).toLowerCase();
          if (instructional.some((s) => around.includes(s))) confidence = 0.95;
          else if (educational.some((s) => context.toLowerCase().includes(s))) confidence = 0.3;
          else if (warning.some((re) => re.test(context.toLowerCase()))) confidence = 0.2;
          if (confidence >= 0.5) pass.add('P5', 'Harmful Content Injection', 'CRITICAL', m, confidence, { span: true, context });
        }
      }
      return dedupeAnalyzer(pass.findings);
    },
  };
})();

// ---------------------------------------------------------------- agent snooping (AS1-AS3)
const snooping = (() => {
  const M = 'static_patterns_agent_snooping';
  const AS1 = pairs(M, 'AS1_PATTERNS'), AS1P = pairs(M, 'AS1_PROSE_PATTERNS');
  const AS2 = pairs(M, 'AS2_PATTERNS'), AS2P = pairs(M, 'AS2_PROSE_PATTERNS');
  const AS3 = pairs(M, 'AS3_PATTERNS'), AS3P = pairs(M, 'AS3_PROSE_PATTERNS');
  const pathRe = rxOf(table(M, '_AS3_SKILL_PATH_FULLMATCH'));

  const normalize = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  /** The current skill's own name, only when its folder name and manifest name agree. */
  function currentIdentifiers(ctx) {
    const fromPath = normalize(ctx?.skillName);
    const fromManifest = normalize(ctx?.manifestName);
    if (fromPath === null) return new Set();
    if (fromManifest !== null && fromManifest !== fromPath) return new Set();
    return new Set([fromPath]);
  }
  function isCurrentSkillPath(text, ids) {
    if (!ids.size) return false;
    const m = new RegExp(`^(?:${pathRe.source})$`, pathRe.flags.replace('g', '')).exec(text);
    return m !== null && ids.has(normalize(m.groups.skill_name));
  }

  return {
    id: 'static_patterns_agent_snooping',
    analyze(content, file, fileType, ctx, view) {
      const pass = new Pass(content, file, fileType, CATEGORY.AGENT_SNOOPING, view);
      const run = (patterns, prose, ruleId, message, severity, extra) => {
        for (const pair of patterns) {
          const isProse = inPairs(pair, prose);
          for (const m of matchesFor(isProse, pair[0], content, FLAGS_IM)) {
            if (extra && extra(m, isProse)) continue;
            pass.add(ruleId, message, severity, m, pair[1]);
          }
        }
      };
      run(AS1, AS1P, 'AS1', 'Agent Config Directory Access', 'HIGH');
      run(AS2, AS2P, 'AS2', 'MCP Config Access', 'HIGH');
      const ids = currentIdentifiers(ctx);
      run(AS3, AS3P, 'AS3', 'Skill Enumeration', 'MEDIUM', (m, isProse) => {
        if (isProse && isDirectlyProhibited(content, m.index, m.end)) return true;
        // The raw view is literal; a normalised view is not, so it does not get this exemption.
        return !view && isCurrentSkillPath(m.text, ids);
      });
      return pass.findings;
    },
  };
})();

// ---------------------------------------------------------------- excessive agency (EA1-EA5)
const agency = (() => {
  const M = 'static_patterns_excessive_agency';
  const EA1 = pairs(M, 'EA1_PATTERNS'), EA1P = pairs(M, 'EA1_PROSE_PATTERNS');
  const EA2 = pairs(M, 'EA2_PATTERNS'), EA2P = pairs(M, 'EA2_PROSE_PATTERNS');
  const EA3 = pairs(M, 'EA3_PATTERNS');
  const EA4 = pairs(M, 'EA4_PATTERNS'), EA4P = pairs(M, 'EA4_PROSE_PATTERNS');
  const approvalAction = rxOf(table(M, '_APPROVAL_ACTION')), noUnapproved = rxOf(table(M, '_NO_UNAPPROVED_ACTION'));
  const prohibitedObject = rxOf(table(M, '_PROHIBITED_ACTION_OBJECT'));
  const keyRe = rxOf(table(M, '_EA5_FRONTMATTER_KEY'), 'g'), inlineCode = rxOf(table(M, '_EA5_INLINE_CODE'), 'g');
  const imperative = rxOf(table(M, '_EA5_IMPERATIVE_PREFIX')), inlineDirective = rxOf(table(M, '_EA5_INLINE_DIRECTIVE_PREFIX'));
  const fenceRe = rxOf(table(M, '_EA5_FENCE')), leadingOption = rxOf(table(M, '_EA5_LEADING_OPTION'));
  const continuation = rxOf(table(M, '_EA5_LINE_CONTINUATION')), modelValue = rxOf(table(M, '_EA5_MODEL_VALUE'));
  const shellFences = new Set(table(M, '_EA5_SHELL_FENCE_LANGUAGES'));
  const lastMatch = (re, s) => { const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let last = null, m; while ((m = g.exec(s))) { last = m; if (!m[0]) g.lastIndex++; } return last; };
  const first = (re, s) => new RegExp(re.source, re.flags.replace('g', '')).exec(s);

  function requiresApproval(content, start, end) {
    if (!content.slice(start, end).toLowerCase().startsWith('without')) return false;
    const prefixStart = Math.max(0, start - 160);
    const prefix = content.slice(prefixStart, start);
    const action = first(approvalAction, prefix);
    if (action) return isDirectlyProhibited(content, prefixStart + action.index, end);
    const constraint = first(noUnapproved, prefix);
    if (!constraint) return false;
    const objectStart = prefixStart + constraint.index + constraint[0].indexOf(constraint.groups.object);
    return isDirectlyProhibited(content, objectStart, end);
  }

  // A small shell-word splitter standing in for Python's shlex.split(posix=True).
  function shellSplit(command) {
    const tokens = []; let cur = '', has = false, quote = null;
    for (let i = 0; i < command.length; i++) {
      const c = command[i];
      if (quote) { if (c === quote) quote = null; else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i]; else cur += c; continue; }
      if (c === "'" || c === '"') { quote = c; has = true; continue; }
      if (c === '\\' && i + 1 < command.length) { cur += command[++i]; has = true; continue; }
      if (/\s/.test(c)) { if (has || cur) { tokens.push(cur); cur = ''; has = false; } continue; }
      cur += c; has = true;
    }
    if (quote) return command.split(/\s+/).filter(Boolean);
    if (has || cur) tokens.push(cur);
    return tokens;
  }

  function isModelSwitchCommand(command) {
    const tokens = shellSplit(command);
    if (!tokens.length) return false;
    const exe = tokens[0].split('/').pop().toLowerCase();
    if (exe === 'claude' && tokens.slice(1).some((t) => t === '-p' || t === '--print' || t.startsWith('--print='))) return true;
    if (exe === 'codex' && tokens.length > 1 && tokens[1].toLowerCase() === 'exec') return true;
    if (exe.startsWith('python') || ['node', 'perl', 'ruby'].includes(exe)) return false;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      let value = null;
      if ((t === '-m' || t === '--model') && i + 1 < tokens.length) value = tokens[i + 1];
      else if (t.startsWith('-m=') || t.startsWith('--model=')) value = t.split('=').slice(1).join('=');
      if (value && first(modelValue, value)) return true;
    }
    return false;
  }

  function commandSpan(line, continued = false) {
    if (line.includes('`')) return null;
    let leading = line.length - line.trimStart().length;
    let candidate = line.slice(leading);
    if (candidate.startsWith('$') || candidate.startsWith('>')) {
      const rest = candidate.slice(1);
      const width = 1 + rest.length - rest.replace(/^[ \t]+/, '').length;
      leading += width; candidate = candidate.slice(width);
    }
    let command = candidate.trim().replace(/^`+|`+$/g, '');
    if (!continued && first(leadingOption, command)?.index === 0) return null;
    if (isModelSwitchCommand(command)) { const start = line.indexOf(command, leading); return [start, start + command.length]; }
    const imp = first(imperative, candidate);
    if (imp && imp.index === 0) {
      command = candidate.slice(imp[0].length).trim().replace(/^`+|`+$/g, '');
      if (isModelSwitchCommand(command)) { const start = line.indexOf(command, leading + imp[0].length); return [start, start + command.length]; }
    }
    return null;
  }

  function inlineSpan(line, m) {
    const before = line.slice(0, m.index);
    if (!first(inlineDirective, before)) return null;
    const raw = m.groups.command, command = raw.trim();
    if (!isModelSwitchCommand(command)) return null;
    const offset = m.index + 1 + (raw.length - raw.trimStart().length);
    return [offset, offset + command.length];
  }

  function frontmatterBounds(content, file) {
    if (file.split('/').pop().toLowerCase() !== 'skill.md') return null;
    const opening = /^﻿*---[ \t]*\r?\n/.exec(content);
    if (!opening) return null;
    const rest = content.slice(opening[0].length);
    const closing = /^---[ \t]*$/m.exec(rest);
    if (!closing) return null;
    return [opening[0].length, opening[0].length + closing.index];
  }

  function ea5(pass, content, file) {
    const bounds = frontmatterBounds(content, file);
    let bodyStart = 0;
    if (bounds) {
      const [start, end] = bounds; bodyStart = end;
      const fm = content.slice(start, end);
      const re = new RegExp(keyRe.source, keyRe.flags.includes('g') ? keyRe.flags : keyRe.flags + 'g');
      let m;
      while ((m = re.exec(fm))) {
        const value = m.groups.value.trim().toLowerCase();
        if (['""', "''", '~', 'null', 'none', 'default', 'auto', 'inherit'].includes(value)) continue;
        pass.addAt('EA5', 'External Model or Provider Selection', 'MEDIUM', start + m.index, start + m.index + m[0].length, 0.9, m[0], { evidence: { selection_surface: 'frontmatter', selection_key: m.groups.key.toLowerCase() } });
      }
    }
    const seen = new Set();
    let cursor = bodyStart, fenceMarker = null, fenceLanguage = '', continued = false;
    const body = content.slice(bodyStart);
    const lines = body.match(/[^\r\n\v\f\x1c-\x1e\x85\u2028\u2029]*(?:\r\n|[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]|$)/g) || [];
    for (const line of lines) {
      if (line === '') continue;
      const lineText = line.replace(/\r?\n$|[\r\n]$/, '');
      const fence = first(fenceRe, lineText);
      if (fence && fence.index === 0) {
        const marker = fence.groups.marker;
        if (fenceMarker === null) { fenceMarker = marker[0]; fenceLanguage = fence.groups.language.toLowerCase(); }
        else if (marker[0] === fenceMarker) { fenceMarker = null; fenceLanguage = ''; }
        cursor += line.length; continued = false; continue;
      }
      const candidates = [];
      if (fenceMarker === null || shellFences.has(fenceLanguage) || !fenceLanguage) {
        const direct = commandSpan(lineText, continued);
        if (direct) candidates.push(direct);
      }
      const ic = new RegExp(inlineCode.source, inlineCode.flags.includes('g') ? inlineCode.flags : inlineCode.flags + 'g');
      let im;
      while ((im = ic.exec(lineText))) { const sp = inlineSpan(lineText, im); if (sp) candidates.push(sp); }
      for (const [a, b] of candidates) {
        const key = `${cursor + a}:${cursor + b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const text = content.slice(cursor + a, cursor + b);
        pass.addAt('EA5', 'External Model or Provider Selection', 'HIGH', cursor + a, cursor + b, 0.9, text, { evidence: { selection_surface: 'command' } });
      }
      continued = first(continuation, lineText) !== null;
      cursor += line.length;
    }
  }

  return {
    id: 'static_patterns_excessive_agency',
    analyze(content, file, fileType, ctx, view) {
      const pass = new Pass(content, file, fileType, CATEGORY.EXCESSIVE_AGENCY, view);
      for (const pair of EA1) for (const m of matchesFor(inPairs(pair, EA1P), pair[0], content, FLAGS_IM)) pass.add('EA1', 'Unrestricted Tool Access', 'MEDIUM', m, pair[1]);
      for (const pair of EA2) {
        const prose = inPairs(pair, EA2P);
        for (const m of matchesFor(prose, pair[0], content, FLAGS_IM)) {
          if (prose && (isDirectlyProhibited(content, m.index, m.end, { allowedTail: prohibitedObject }) || requiresApproval(content, m.index, m.end))) continue;
          pass.add('EA2', 'Autonomous Decision Making', 'MEDIUM', m, pair[1]);
        }
      }
      for (const pair of EA3) for (const m of paragraphMatches(pair[0], content, FLAGS_IM)) pass.add('EA3', 'Scope Creep', 'LOW', m, pair[1]);
      for (const pair of EA4) for (const m of matchesFor(inPairs(pair, EA4P), pair[0], content, FLAGS_IM)) pass.add('EA4', 'Unbounded Resource Access', 'MEDIUM', m, pair[1]);
      if (!view) ea5(pass, content, file);
      return pass.findings;
    },
  };
})();

// ---------------------------------------------------------------- anti-refusal (AR1-AR3)
const antiRefusal = (() => {
  const M = 'static_patterns_anti_refusal';
  const RULES = table(M, '_RULES');
  const R = (n, extra = '') => rxOf(table(M, n), extra);
  const first = (re, s, from = 0) => { const g = new RegExp(re.source, re.flags.replace('g', '') + 'g'); g.lastIndex = from; return g.exec(s); };
  const full = (re, s) => new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')).exec(s);
  const BOUNDARY = R('_CLAUSE_BOUNDARY_PATTERN');

  function matchClauseBounds(line, start, end) {
    let clauseStart = 0;
    const g = new RegExp(BOUNDARY.source, 'g');
    let b;
    while ((b = g.exec(line))) { if (b.index >= start) break; clauseStart = b.index + b[0].length; }
    let clauseEnd = line.length;
    const nb = first(BOUNDARY, line, end);
    if (nb) clauseEnd = nb.index;
    return [clauseStart, clauseEnd];
  }
  function matchClause(line, start, end) {
    const [cs, ce] = matchClauseBounds(line, start, end);
    return [line.slice(cs, ce), start - cs, end - cs];
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function isQuoted(line, text) {
    const t = text.toLowerCase(), l = line.toLowerCase();
    for (const q of ['"', "'", '`']) {
      if (new RegExp(`${esc(q)}[^${esc(q)}\\n]*${esc(t)}[^${esc(q)}\\n]*${esc(q)}`).test(l)) return true;
    }
    return new RegExp(`\\bthe\\s+phrase\\b.*?["'\`][^"'\`\\n]*${esc(t)}[^"'\`\\n]*["'\`]`).test(l);
  }
  function defensiveContext(line, prev) {
    if (first(R('_DEFENSIVE_AR_CONTEXT_PATTERN'), line)) return true;
    if (!prev) return false;
    return !!(first(R('_BENIGN_AR_WARNING_INTRO_PATTERN'), prev) || first(R('_BENIGN_AR_DENYLIST_DECLARATION_PATTERN'), prev) || first(R('_BENIGN_AR_FIXTURE_INTRO_PATTERN'), prev));
  }
  function narrative(clause, clauseStart) {
    const prefix = clause.slice(0, clauseStart);
    const prefixEnd = prefix.trimEnd().length;
    return table(M, '_RETROSPECTIVE_AR_NARRATIVE_PATTERNS').some((o) => {
      const re = rxOf(o, 'g'); re.lastIndex = 0; const m = re.exec(prefix);
      return m !== null && m.index + m[0].length === prefixEnd;
    });
  }
  function schemaField(clause, text, clauseEnd) {
    if (!first(R('_AR2_LIVE_SUPPRESSION_PATTERN'), text)) return false;
    return !!first(R('_BENIGN_AR_SCHEMA_FIELD_PATTERN'), clause.slice(clauseEnd));
  }
  function benign(line, text, ls, le, prev) {
    const [clause, cs, ce] = matchClause(line, ls, le);
    if (narrative(clause, cs)) return true;
    if (schemaField(clause, text.toLowerCase(), ce)) return true;
    return isQuoted(line, text) && defensiveContext(line, prev);
  }
  function isTaskJudgment(content, m) {
    if (!full(R('_AR2_JUDGE_ONLY_PATTERN'), m.text)) return false;
    const CH = table(M, '_AR2_JUDGMENT_CONTEXT_CHARS');
    const limit = Math.min(content.length, m.end + CH);
    const bre = R('_AR2_JUDGMENT_BOUNDARY_PATTERN');
    const forward = first(bre, content.slice(0, limit), m.end);
    if (!forward && limit < content.length) return false;
    const clauseEnd = forward ? forward.index : limit;
    const prefixStart = Math.max(0, m.index - CH);
    let clauseStart = prefixStart;
    const g = new RegExp(bre.source, bre.flags.replace('g', '') + 'g');
    g.lastIndex = prefixStart; let b;
    while ((b = g.exec(content.slice(0, m.index)))) { clauseStart = b.index + b[0].length; if (!b[0]) g.lastIndex++; }
    if (clauseStart === prefixStart && prefixStart > 0) return false;
    const suffix = content.slice(m.end, clauseEnd);
    if (full(R('_AR2_TASK_JUDGMENT_OBJECT_PATTERN'), suffix)) return true;
    return !suffix.trim() && !!first(R('_AR2_OBSERVATION_SUBJECT_PATTERN'), content.slice(Math.max(0, m.index - 96), m.index));
  }
  function isDirective(clauseLower, matched) {
    if (table(M, '_AR_DIRECT_INTENT_PATTERNS').some((o) => first(rxOf(o), clauseLower))) return true;
    if (table(M, '_AR2_DIRECT_INTENT_PATTERNS').some((o) => first(rxOf(o), clauseLower))) return true;
    return matched.toLowerCase().includes('do anything now');
  }
  const explicitExample = (ctx) => !!first(R('_EXPLICIT_EXAMPLE_CONTEXT_PATTERN'), ctx);

  function emittedContext(context, line, directive, prev) {
    if (!directive) return context;
    const label = R('_DIRECTIVE_DOCUMENTATION_LABEL_PATTERN');
    const trimmed = line.replace(new RegExp(label.source, label.flags.replace('g', '')), '');
    if (trimmed !== line) return trimmed;
    if (prev && first(R('_DOCUMENTATION_HEADING_PATTERN'), prev)) return line;
    if (explicitExample(context)) return line;
    return context;
  }

  return {
    id: 'static_patterns_anti_refusal',
    analyze(content, file, fileType, ctx, view) {
      const pass = new Pass(content, file, fileType, CATEGORY.ANTI_REFUSAL, view);
      const lines = splitlines(content);
      for (const [ruleId, patterns] of RULES) {
        for (const [src, base] of patterns) {
          for (const m of paragraphMatches(src, content, FLAGS_IM)) {
            if (ruleId === 'AR2' && isTaskJudgment(content, m)) continue;
            const [lineNum, column] = new LineIndex(content).lineAndColumn(m.index);
            const line = lines.length ? lines[lineNum - 1] ?? '' : content;
            const prev = lineNum > 1 ? lines[lineNum - 2] : null;
            const context = getContextFromLines(lines, lineNum, 3, column);
            const security = !!(full(R('_MODE_ENABLED_RE'), m.text) && first(R('_SECURITY_REVIEW_CONTEXT_RE'), context));
            const lineStart = content.lastIndexOf('\n', m.index - 1) + 1;
            const ls = m.index - lineStart, le = ls + m.text.length;
            const [clause] = matchClause(line, ls, le);
            const directive = isDirective(clause.toLowerCase(), m.text);
            const example = isCodeExample(context) && explicitExample(context);
            const isBenign = benign(line, m.text, ls, le, prev);
            const tags = [...pass.tags];
            if (security || example || isBenign) tags.push('contextual-triage', 'likely-benign-context');
            pass.add(ruleId, 'Anti-Refusal Statement', 'HIGH', m, base, { span: true, tags, context: emittedContext(context, line, directive, prev) });
          }
        }
      }
      return dedupeAnalyzer(pass.findings);
    },
  };
})();

export const BATCH1 = [ssrf, deserialization, harmful, snooping, agency, antiRefusal];
