import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { cleanGitignore, cleanScripts, cleanSettings, cleanSource, cleanTasks, isOriginalOf } from './clean.js';
import { fileHistory, git, repoRoot, showFile, toPosix } from './git.js';

/** After deleting a file, remove folders it leaves empty, up to the project root. */
function pruneEmpty(full, root) {
  let dir = path.dirname(full);
  while (dir.startsWith(root) && dir !== root) {
    try {
      if (readdirSync(dir).length) return;
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

function remove(full, root) {
  rmSync(full, { recursive: true, force: true });
  pruneEmpty(full, root);
}

/**
 * If git has an older version of this file without malware, and its code is the same as what we
 * cleaned (ignoring spacing), use that exact version. You get your original bytes back, including
 * line breaks the malware may have mangled.
 */
function originalFromHistory(gitRoot, rel, cleaned) {
  if (!gitRoot) return null;
  for (const commit of fileHistory(gitRoot, rel)) {
    const old = showFile(gitRoot, commit, rel);
    if (!old) continue;
    const verdict = isOriginalOf(old.toString('utf8'), cleaned);
    if (verdict === null) continue; // that version is infected too, look further back
    return verdict ? old : null;
  }
  return null;
}

export { cleanSource };

/**
 * Applies the fixes for a scan result. Returns a list of { file, action } for what changed.
 * With `untrackSecrets`, committed .env files are removed from git (kept on disk).
 */
export function fix(result, { untrackSecrets = false } = {}) {
  const { root, findings } = result;
  const gitRoot = repoRoot(root);
  const prefix = gitRoot ? toPosix(path.relative(gitRoot, root)) : '';
  const repoRel = (rel) => (prefix ? `${prefix}/${rel}` : rel);
  const changes = [];
  const done = new Set();
  const hasEnv = findings.some((f) => f.rule === 'secret' || f.rule === 'env-not-ignored');
  const unignoredEnv = findings.some((f) => f.rule === 'env-not-ignored');

  for (const f of findings) {
    if (!f.fix || f.fix === 'ignore-env' || done.has(f.file + f.fix)) continue;
    done.add(f.file + f.fix);
    const full = path.join(root, f.file);

    try {
      if (f.fix === 'delete' || f.fix === 'delete-dir') {
        if (existsSync(full)) {
          remove(full, root);
          changes.push({ file: f.file, action: 'deleted' });
        }
        continue;
      }
      if (f.fix === 'untrack') {
        if (untrackSecrets && gitRoot) {
          git(gitRoot, ['rm', '--cached', '-q', '--', repoRel(f.file)]);
          changes.push({ file: f.file, action: 'removed from git, kept on disk' });
        }
        continue;
      }
      if (!existsSync(full)) continue;
      const text = readFileSync(full, 'utf8');
      let next = null;
      let action = 'cleaned';

      if (f.fix === 'strip') {
        const cleaned = cleanSource(text);
        if (cleaned !== null) {
          const original = originalFromHistory(gitRoot, repoRel(f.file), cleaned);
          if (original) {
            writeFileSync(full, original);
            changes.push({ file: f.file, action: 'restored your original from git history' });
            continue;
          }
          next = cleaned;
        }
      } else if (f.fix === 'script') {
        next = cleanScripts(text);
      } else if (f.fix === 'gitignore') {
        next = cleanGitignore(text, hasEnv);
      } else if (f.fix === 'autorun') {
        const r = cleanTasks(text);
        if (r.remove) {
          remove(full, root);
          changes.push({ file: f.file, action: 'deleted' });
          continue;
        }
        next = r.text;
        action = 'removed the auto-run task';
      } else if (f.fix === 'setting') {
        const r = cleanSettings(text);
        if (r.remove) {
          remove(full, root);
          changes.push({ file: f.file, action: 'deleted' });
          continue;
        }
        next = r.text;
        action = 'turned automatic tasks off';
      }

      if (next !== null && next !== text) {
        writeFileSync(full, next);
        changes.push({ file: f.file, action });
      }
    } catch (err) {
      changes.push({ file: f.file, action: `could not fix: ${err.message}`, failed: true });
    }
  }

  // If .env files are committed, make sure .gitignore keeps them out from now on.
  if ((untrackSecrets && hasEnv) || unignoredEnv) {
    const gi = path.join(root, '.gitignore');
    const text = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    const next = cleanGitignore(text, true);
    if (next !== text) {
      writeFileSync(gi, next);
      changes.push({ file: '.gitignore', action: 'now ignores .env files' });
    }
  }
  return changes;
}
