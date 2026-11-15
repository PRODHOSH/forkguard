import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { git } from './git.js';
import { authArgs, hasOpenFixPr, openPr } from './pr.js';
import { c } from './report.js';

const hasHigh = (branch) => branch.findings.some((f) => f.level === 'high');

/**
 * Decides what `--mine --fix` does. A repo gets a pull request when its default branch is infected
 * and forkguard knows how to clean it. Infected side branches are only listed: one pull request
 * per repo keeps the noise down, and a side branch is yours to judge.
 */
export function planFixes(results) {
  const targets = [];
  const sideBranches = [];
  for (const r of results) {
    if (r.error || !r.branches) continue;
    const main = r.branches.find((b) => b.name === r.defaultBranch);
    if (main && hasHigh(main) && main.findings.some((f) => f.fix)) targets.push(r);
    const side = r.branches.filter((b) => b.name !== r.defaultBranch && hasHigh(b)).map((b) => b.name);
    if (side.length) sideBranches.push({ name: r.name, branches: side });
  }
  return { targets, sideBranches };
}

/** Opens one pull request per repo. Each repo is downloaded to a temporary folder that is deleted afterwards. */
export async function openFixPrs(targets, token) {
  const opened = [];
  for (const r of targets) {
    console.log(`\n${c.bold(r.name)}`);
    try {
      if (await hasOpenFixPr(r.name)) {
        console.log('  Already has an open forkguard pull request, so nothing new was opened.');
        continue;
      }
      const dir = mkdtempSync(path.join(tmpdir(), 'forkguard-pr-'));
      try {
        git(dir, [...authArgs(token), 'clone', '--quiet', '--depth', '50', `https://github.com/${r.name}.git`, 'repo']);
        const url = await openPr(path.join(dir, 'repo'), { token });
        opened.push({ name: r.name, url });
      } finally {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      }
    } catch (err) {
      console.log(`  ${c.red('Could not open a pull request:')} ${err.message}`);
      opened.push({ name: r.name, error: err.message });
    }
  }
  return opened;
}
