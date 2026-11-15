// Prints how much of SkillSpector's rule catalog forkguard covers. Run: node tools/skillspector/stats.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaraRules } from '../../src/skills/modules/yara.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'skills');
const tables = JSON.parse(readFileSync(path.join(root, 'data', 'tables.json'), 'utf8'));
// every rule id found in SkillSpector's analyzer source and its rule catalog (115)
const catalog = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'skillspector-rule-ids.json'), 'utf8'));

const source = readdirSync(path.join(root, 'modules')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(root, 'modules', f), 'utf8')).join('\n');
const emitted = new Set([...source.matchAll(/'([A-Z]{1,4}\d{1,2})'/g)].map((m) => m[1]));
for (const y of ['YR1', 'YR2', 'YR3', 'YR4']) emitted.add(y);
// rule ids that come out of tables instead of being written in the code
for (const [id] of tables.static_patterns_anti_refusal._RULES) emitted.add(id);
for (const rules of Object.values(tables.static_patterns_deserialization._LANG_RULES)) for (const r of rules) emitted.add(r[0]);
const covered = catalog.filter((id) => emitted.has(id));
const missing = catalog.filter((id) => !emitted.has(id));

const rules = loadYaraRules();
const yaraStrings = rules.reduce((n, r) => n + r.strings.length, 0);

// every [pattern, confidence] pair in the rule tables, counted once by pattern text
const perModule = {}, seen = new Set();
const walk = (o, into) => { if (Array.isArray(o)) { if (o.length === 2 && typeof o[0] === 'string' && typeof o[1] === 'number' && o[1] > 0 && o[1] <= 1) into.add(o[0]); else o.forEach((x) => walk(x, into)); } else if (o && typeof o === 'object') Object.values(o).forEach((x) => walk(x, into)); };
for (const [m, consts] of Object.entries(tables)) {
  if (!m.startsWith('static_patterns_')) continue;
  const own = new Set();
  for (const [k, v] of Object.entries(consts)) if (/PATTERNS$|^_RULES$|^_LANG_RULES$|^DANGEROUS_ACTIONS$/.test(k)) walk(v, own);
  perModule[m.replace('static_patterns_', '')] = own.size;
  own.forEach((x) => seen.add(x));
}
const pairs = seen;
const withLists = { modules: Object.keys(tables).filter((m) => m.startsWith('static_patterns_')).length };

console.log(JSON.stringify({
  catalogRuleIds: catalog.length, covered: covered.length, notCovered: missing,
  yaraRules: rules.length, yaraRuleFiles: new Set(rules.map((r) => r.namespace)).size, yaraStrings,
  uniqueRulePatterns: pairs.size, patternsPerModule: perModule, ...withLists,
}, null, 1));
