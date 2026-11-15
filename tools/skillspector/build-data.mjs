// SPDX-License-Identifier: Apache-2.0
// Written for forkguard to rebuild src/skills/data/ from a checkout of NVIDIA SkillSpector (Apache-2.0).
// See NOTICE. Usage: node tools/skillspector/build-data.mjs /path/to/SkillSpector
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const source = process.argv[2];
if (!source) { console.error('Usage: node tools/skillspector/build-data.mjs /path/to/SkillSpector'); process.exit(2); }
const pkg = path.join(source, 'src', 'skillspector');

const tmp = mkdtempSync(path.join(tmpdir(), 'fg-skillspector-'));
try {
  // 1. Copy the rule tables out of the Python source without importing it
  const json = path.join(tmp, 'tables.json');
  execFileSync('python3', ['-I', path.join(here, 'extract_tables.py'), path.join(pkg, 'nodes', 'analyzers'), json], { stdio: 'inherit' });
  const all = JSON.parse(readFileSync(json, 'utf8'));
  const keep = /^(static_patterns_.*|prohibition_context|common|whitespace_padding|pattern_defaults)\.py$/;
  const out = {};
  for (const [file, v] of Object.entries(all)) if (keep.test(file)) out[file.replace(/\.py$/, '')] = v.consts;
  const data = path.join(root, 'src', 'skills', 'data');
  mkdirSync(path.join(data, 'yara'), { recursive: true });
  writeFileSync(path.join(data, 'tables.json'), JSON.stringify(out));

  // 2. The table of look-alike letters
  execFileSync('python3', ['-I', '-c', [
    'import ast, json, sys',
    'tree = ast.parse(open(sys.argv[1], encoding="utf8").read())',
    'for n in tree.body:',
    '    if isinstance(n, ast.AnnAssign) and getattr(n.target, "id", "") == "ASCII_CONFUSABLE_SKELETON":',
    '        d = ast.literal_eval(n.value)',
    'json.dump({str(k): v for k, v in d.items()}, open(sys.argv[2], "w"), separators=(",", ":"))',
  ].join('\n'), path.join(pkg, 'unicode_confusables.py'), path.join(data, 'confusables.json')]);

  // 3. The YARA rule files. malware.yar.b64 holds the same rules, base64 encoded.
  const rules = path.join(pkg, 'yara_rules');
  for (const f of readdirSync(rules)) {
    if (f.endsWith('.yar')) copyFileSync(path.join(rules, f), path.join(data, 'yara', f));
    else if (f.endsWith('.yar.b64')) writeFileSync(path.join(data, 'yara', f.replace(/\.b64$/, '')), Buffer.from(readFileSync(path.join(rules, f), 'utf8').replace(/\s+/g, ''), 'base64'));
  }
  console.log(`wrote ${Object.keys(out).length} modules of tables, the look-alike table and ${readdirSync(path.join(data, 'yara')).length} YARA files`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
