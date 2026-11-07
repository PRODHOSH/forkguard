import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/scan.js';
import { fix, cleanSource } from '../src/fix.js';
import { MARKERS } from '../src/rules.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'forkguard.js');

// Harmless stand-ins shaped like the real thing: normal code, a long run of spaces, a long tail.
const payload = (c = 'x') => ' '.repeat(180) + c.repeat(3000);
const prelude = [
  ['import { create', "Require } from 'module';"].join(''),
  '',
  ['const require = create', 'Require(import.meta.url);'].join(''),
  ['var module = { exp', 'orts: {} };'].join(''),
  '',
];

function tmp() {
  return mkdtempSync(path.join(tmpdir(), 'forkguard-test-'));
}

function put(root, rel, content) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function gitInit(root) {
  const g = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Test');
  g('config', 'user.email', 'test@example.com');
  g('config', 'core.autocrlf', 'false');
  return g;
}

const ORIGINAL_POSTCSS = 'const config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n';

function infectedProject() {
  const root = tmp();
  put(root, 'package.json', JSON.stringify({ name: 'demo', scripts: { dev: 'node init && next dev', build: 'node init && next build', lint: 'eslint' } }, null, 2));
  put(root, 'init', `const a = 1;${payload()}\n`);
  put(root, 'postcss.config.mjs', [...prelude, ORIGINAL_POSTCSS.trimEnd() + payload('y'), ''].join('\n'));
  put(root, 'public/fonts/fa-solid-600.ttf', '(function () { return 1; })();');
  put(root, 'public/fonts/fa-solid-900.woff2', Buffer.from('wOF2realfontbytes'));
  put(root, 'public/fonts/README.md', '# Fonts Directory\n\nCustom fonts for the Blockchain Explorer application.\n');
  put(root, '.vscode/tasks.json', JSON.stringify({ version: '2.0.0', tasks: [{ label: 'eslint-check', type: 'shell', command: 'node', args: ['./public/fonts/fa-solid-600.ttf'], runOptions: { runOn: 'folderOpen' } }] }, null, 2));
  put(root, '.vscode/settings.json', '{\n  "task.allowAutomaticTasks": "on",\n  "compile-hero.disable-compile-files-on-did-save-code": true\n}\n');
  put(root, '.gitignore', 'node_modules\n.env\nconfig.bat\n');
  put(root, 'config.bat', '@echo off\n');
  put(root, 'src/app.js', 'export const ok = true;\n');
  return root;
}

test('a clean project has no findings', () => {
  const root = tmp();
  put(root, 'package.json', JSON.stringify({ name: 'ok', scripts: { dev: 'next dev' } }));
  put(root, 'postcss.config.mjs', ORIGINAL_POSTCSS);
  put(root, 'public/fonts/Inter.woff2', Buffer.from('wOF2realfont'));
  const r = scan(root);
  assert.equal(r.findings.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test('finds every part of the infection', () => {
  const root = infectedProject();
  const rules = scan(root).findings.map((f) => `${f.rule}:${f.file}`);
  for (const expected of [
    'hidden-code:init', 'hidden-code:postcss.config.mjs', 'script:package.json', 'fake-font:public/fonts/fa-solid-600.ttf',
    'decoy-folder:public/fonts/', 'autorun:.vscode/tasks.json', 'autorun-setting:.vscode/settings.json',
    'gitignore:.gitignore', 'dropper:config.bat',
  ]) assert.ok(rules.includes(expected), `missing ${expected}\n${rules.join('\n')}`);
  assert.ok(!rules.some((r) => r.includes('src/app.js')), 'normal code must not be flagged');
  rmSync(root, { recursive: true, force: true });
});

test('fix removes the infection and leaves real code alone', () => {
  const root = infectedProject();
  const changes = fix(scan(root));
  assert.ok(changes.length > 0);
  assert.equal(scan(root).findings.length, 0);
  assert.equal(readFileSync(path.join(root, 'postcss.config.mjs'), 'utf8'), ORIGINAL_POSTCSS);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts, { dev: 'next dev', build: 'next build', lint: 'eslint' });
  assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), 'node_modules\n.env\n');
  assert.ok(!existsSync(path.join(root, 'init')));
  assert.ok(!existsSync(path.join(root, 'public/fonts')), 'decoy folder should be gone');
  assert.ok(!existsSync(path.join(root, 'public')), 'folders left empty should be gone too');
  assert.ok(!existsSync(path.join(root, 'config.bat')));
  assert.ok(existsSync(path.join(root, 'src/app.js')));
  rmSync(root, { recursive: true, force: true });
});

test('restores the exact original bytes from git history', () => {
  const root = tmp();
  const g = gitInit(root);
  const original = 'export default {\r\n  plugins: {\r\n    tailwindcss: {},\r\n  },\r\n};\r\n\r\n\r\n';
  put(root, 'postcss.config.js', original);
  g('add', '.');
  g('commit', '-q', '-m', 'first');
  // The malware doubled every line break and hid code after the last line.
  const mangled = original.trimEnd().replace(/\r\n/g, '\r\n\r\n') + payload() + '\r\n';
  put(root, 'postcss.config.js', [...prelude, mangled].join('\r\n'));
  g('commit', '-q', '-am', 'update');
  const changes = fix(scan(root));
  assert.ok(changes.some((c) => c.action.includes('original')), JSON.stringify(changes));
  assert.equal(readFileSync(path.join(root, 'postcss.config.js'), 'utf8'), original);
  rmSync(root, { recursive: true, force: true });
});

test('keeps your own blank lines when removing the injected require lines', () => {
  const text = ['import a from "a";', ...prelude.slice(0, 3), '', 'const x = a;', 'export default x;' + payload(), ''].join('\n');
  assert.equal(cleanSource(text), 'import a from "a";\n\nconst x = a;\nexport default x;\n');
});

test('flags a rewritten latest commit: same moment, different timezone', () => {
  const root = tmp();
  const g = gitInit(root);
  put(root, 'init', `x${payload()}`);
  g('add', '.');
  spawnSync('git', ['commit', '-q', '-m', 'Update README.md'], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-06T22:29:12+05:30', GIT_COMMITTER_DATE: '2026-11-06T17:59:12+01:00' },
  });
  assert.ok(scan(root).findings.some((f) => f.rule === 'rewritten'));
  rmSync(root, { recursive: true, force: true });
});

test('known malware signatures are caught in any source file', () => {
  const root = tmp();
  put(root, 'lib/util.js', `module.exports = 1;\n${MARKERS[0]}\n`);
  assert.ok(scan(root).findings.some((f) => f.rule === 'hidden-code' && f.file === 'lib/util.js'));
  rmSync(root, { recursive: true, force: true });
});

test('known malicious packages are caught', () => {
  const root = tmp();
  put(root, 'package.json', JSON.stringify({ dependencies: { ['tailwind-' + 'mainanimation']: '^1.0.0' } }));
  assert.ok(scan(root).findings.some((f) => f.rule === 'bad-package'));
  rmSync(root, { recursive: true, force: true });
});

test('only the auto-run task is removed when tasks.json has real tasks too', () => {
  const root = tmp();
  put(root, '.vscode/tasks.json', JSON.stringify({ version: '2.0.0', tasks: [
    { label: 'build', type: 'shell', command: 'npm run build' },
    { label: 'x', type: 'shell', command: 'node', args: ['fonts/a.ttf'], runOptions: { runOn: 'folderOpen' } },
  ] }));
  fix(scan(root));
  const tasks = JSON.parse(readFileSync(path.join(root, '.vscode/tasks.json'), 'utf8')).tasks;
  assert.deepEqual(tasks.map((t) => t.label), ['build']);
  rmSync(root, { recursive: true, force: true });
});

test('the gate stops npm install in an infected project and lets safe commands through', () => {
  const root = infectedProject();
  const run = (...a) => spawnSync(process.execPath, [BIN, '--gate', ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, FORKGUARD_SKIP: '' } });
  assert.equal(run('npm', 'install').status, 1);
  assert.equal(run('npm', 'run', 'dev').status, 1);
  const version = run('npm', '--version');
  assert.equal(version.status, 0);
  assert.equal(version.stdout, '', 'the gate must not answer flags meant for npm');
  assert.equal(spawnSync(process.execPath, [BIN, '--gate', 'npm', 'install'], { cwd: root, env: { ...process.env, FORKGUARD_SKIP: '1' } }).status, 0);
  rmSync(root, { recursive: true, force: true });
});

test('scan exits 1 when something dangerous is found', () => {
  const root = infectedProject();
  const res = spawnSync(process.execPath, [BIN, root, '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.ok(JSON.parse(res.stdout).findings.length >= 8);
  rmSync(root, { recursive: true, force: true });
});
