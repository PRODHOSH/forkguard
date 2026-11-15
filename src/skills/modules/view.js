// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// The "security view" of a text: what a model would read after hidden characters are dropped and look-alike
// letters are folded to plain ASCII. SkillSpector scans this view as well as the raw text.
// Port of normalized_security_view() in artifacts.py. Simplified: it does not keep emoji joiners or other
// context sensitive invisible characters apart from the rest.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKELETON = new Map(Object.entries(JSON.parse(readFileSync(path.join(here, '..', 'data', 'confusables.json'), 'utf8'))).map(([k, v]) => [Number(k), v]));

const IGNORED_ASCII_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const FORMAT_OR_CONTROL = /[\p{Cf}\p{Cc}]/u;
const ALLOWED = new Set(['\n', '\r', '\t']);

export function isUnconditionallyIgnored(ch) {
  return IGNORED_ASCII_CONTROL.test(ch) || (FORMAT_OR_CONTROL.test(ch) && !ALLOWED.has(ch));
}

/** { text, offsets } where offsets[i] is the index in the original text that produced text[i]. */
export function normalizedView(text) {
  let out = '';
  const offsets = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isUnconditionallyIgnored(ch)) continue;
    let piece = ch.normalize('NFKC');
    let mapped = '';
    for (const c of piece) mapped += SKELETON.get(c.codePointAt(0)) ?? c;
    for (let k = 0; k < mapped.length; k++) { out += mapped[k]; offsets.push(i); }
  }
  return { text: out, offsets };
}

/** Whether the normalized view differs from the original, so a second pass is worth doing. */
export function viewDiffers(text) {
  if (/^[\x20-\x7e\t\r\n]*$/.test(text)) return false;
  return normalizedView(text).text !== text;
}
