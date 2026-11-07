import path from 'node:path';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  red: paint('31'), yellow: paint('33'), green: paint('32'), dim: paint('2'), bold: paint('1'), cyan: paint('36'),
};

/** File and message side by side, or the message on its own line when the path is too long. */
function row(file, width, message) {
  return file.length < width ? `${file.padEnd(width)}${message}` : `${file}\n${' '.repeat(8 + width)}${message}`;
}

export const label = (level) => (level === 'high' ? c.red(c.bold('HIGH')) : c.yellow(c.bold('MED ')));

export function printScan({ root, findings, checked }, { quiet = false } = {}) {
  const name = path.basename(root);
  const high = findings.filter((f) => f.level === 'high').length;

  if (!findings.length) {
    if (!quiet) console.log(`${c.green('forkguard')}  ${name} looks clean ${c.dim(`(${checked} files checked)`)}`);
    return;
  }

  console.log(`${c.bold('forkguard')}  ${name}\n`);
  const width = Math.min(40, Math.max(...findings.map((f) => f.file.length)) + 2);
  for (const f of findings) console.log(`  ${label(f.level)}  ${row(f.file, width, f.message)}`);
  console.log('');

  const total = `${findings.length} problem${findings.length === 1 ? '' : 's'} found`;
  if (high) {
    console.log(`  ${c.red(total + '.')} Do not run npm install, npm run dev or open this folder in VS Code yet.`);
  } else {
    console.log(`  ${c.yellow(total + '.')} Nothing that runs on its own, but worth a look.`);
  }
  if (findings.some((f) => f.fix)) {
    console.log(`  Run ${c.cyan('forkguard fix')} to clean it, or ${c.cyan('forkguard pr')} to clean it and open a pull request.`);
  }
}

export function printChanges(changes) {
  if (!changes.length) {
    console.log('  Nothing to change.');
    return;
  }
  const width = Math.min(40, Math.max(...changes.map((x) => x.file.length)) + 2);
  for (const x of changes) console.log(`  ${x.failed ? c.red('fail') : c.green('done')}  ${row(x.file, width, x.action)}`);
}
