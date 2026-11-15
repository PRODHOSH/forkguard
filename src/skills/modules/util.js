// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Shared pieces for the skill rule modules.
import { makeFinding, CATEGORY } from '../engine.js';
import { LineIndex, getContext, paragraphMatches, patternMatches, PY_I, PY_M } from '../text.js';

export const FLAGS_IM = PY_I | PY_M;

/** One analyzer pass over one file. Collects findings the way the Python analyzers build them. */
export class Pass {
  /**
   * `view` is set when the text being scanned is the normalised security view. Positions and context then
   * come from the original text through `view.offsets`, and findings are tagged `normalized-view`.
   */
  constructor(content, file, fileType, category, view = null) {
    this.content = content; this.file = file; this.fileType = fileType; this.tags = category ? [category] : [];
    this.view = view;
    this.index = new LineIndex(view ? view.original : content);
    this.findings = [];
  }

  src(offset) { return this.view ? this.view.offsets[Math.min(Math.max(offset, 0), this.view.offsets.length - 1)] ?? 0 : offset; }
  srcEnd(offset) { return this.view ? (this.view.offsets[Math.min(Math.max(offset - 1, 0), this.view.offsets.length - 1)] ?? 0) + 1 : offset; }
  pos(offset) { return this.index.lineAndColumn(this.src(offset)); }
  endPos(offset) { return this.index.lineAndColumn(this.srcEnd(offset)); }
  ctx(offset, lines = 3) { return this.view ? getContext(this.view.original, this.src(offset), lines, this.index) : getContext(this.content, offset, lines, this.index); }

  /** Add a finding for a regex match. `span` keeps columns, otherwise only the start line is kept. */
  add(ruleId, message, severity, m, confidence, { span = false, tags = this.tags, context, evidence, matched, complete } = {}) {
    const text = complete ?? m.text;
    const [line, column] = this.pos(m.index);
    const [endLine, endColumn] = span ? this.endPos(m.end) : [null, null];
    this.findings.push(makeFinding({
      ruleId, message, severity, file: this.file, line, endLine, column: span ? column : null, endColumn: span ? endColumn : null,
      confidence, tags: this.view ? [...tags, 'normalized-view'] : tags, context: context ?? this.ctx(m.index), complete: text, matched: matched ?? text, evidence,
    }));
    return this.findings[this.findings.length - 1];
  }

  /** A plain finding without a regex match, for checks that already know where they are. */
  addAt(ruleId, message, severity, offset, endOffset, confidence, text, extra = {}) {
    const [line, column] = this.pos(offset);
    const [endLine, endColumn] = endOffset == null ? [null, null] : this.endPos(endOffset);
    this.findings.push(makeFinding({
      ruleId, message, severity, file: this.file, line, endLine, column: endOffset == null ? null : column, endColumn,
      confidence, tags: [...(extra.tags ?? this.tags), ...(this.view ? ['normalized-view'] : [])], context: extra.context ?? this.ctx(offset), complete: text, matched: extra.matched ?? text, evidence: extra.evidence,
    }));
    return this.findings[this.findings.length - 1];
  }
}

/** True when `pair` ([pattern, confidence]) is in the `list`, as Python's tuple membership test. */
export const inPairs = (pair, list) => list.some((p) => p[0] === pair[0] && p[1] === pair[1]);

export const matchesFor = (isProse, src, content, flags) => (isProse ? paragraphMatches(src, content, flags) : patternMatches(src, content, flags));

export { CATEGORY, patternMatches, paragraphMatches };
