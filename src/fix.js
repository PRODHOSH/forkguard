import { readFileSync, existsSync, readdirSync, rmdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { cleanGitignore, cleanScripts, cleanSettings, cleanSource, cleanTasks, isOriginalOf } from './clean.js';
import { fileHistory, git, repoRoot, showFile, toPosix } from './git.js';
import { inside, isRegularFile, safeRemove, safeWrite } from './safe.js';

/**
 * After deleting a file, remove folders it leaves empty, up to the project root. Only real folders
 * are removed: a link is never followed, and nothing outside the project is touched.
 */
function pruneEmpty(full, root) {
  const stop = path.resolve(root);
  let dir = path.dirname(path.resolve(full));
  while (dir !== stop && inside(root, dir)) {
    let st;
    try {
      st = lstatSync(dir);
    } catch {
      return;
    }
    if (!st.isDirectory() || st.isSymbolicLink()) return;
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
  if (safeRemove(root, full)) pruneEmpty(full, root);
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
 * Which git repo a file belongs to, and its path inside that repo. A folder full of projects has
 * a different repo for each one, so this is worked out per file.
 */
export function repoOf(root, rel, cache = new Map()) {
  const dir = path.dirname(path.join(root, rel));
  if (!cache.has(dir)) cache.set(dir, repoRoot(dir));
  const gitRoot = cache.get(dir);
  return { gitRoot, repoRel: gitRoot ? toPosix(path.relative(gitRoot, path.join(root, rel))) : rel };
}

/** The names of the projects (git repos) the fixable findings are in. A file outside any repo counts as one more. */
export function projectsOf(result) {
  const cache = new Map();
  const names = new Set();
  for (const f of result.findings) {
    if (!f.fix || f.fix === 'ignore-env') continue;
    const { gitRoot } = repoOf(result.root, f.file, cache);
    names.add(gitRoot ? path.relative(result.root, gitRoot) || '.' : '(not in a git repo)');
  }
  return names;
}

/**
 * Applies the fixes for a scan result. Returns a list of { file, action } for what changed.
 * With `untrackSecrets`, committed .env files are removed from git (kept on disk).
 */
export function fix(result, { untrackSecrets = false } = {}) {
  const { root, findings } = result;
  const dirCache = new Map();
  const changes = [];
  const done = new Set();
  const hasEnv = findings.some((f) => f.rule === 'secret' || f.rule === 'env-not-ignored');

  for (const f of findings) {
    if (!f.fix || f.fix === 'ignore-env' || done.has(f.file + f.fix)) continue;
    done.add(f.file + f.fix);
    const full = path.join(root, f.file);
    const { gitRoot, repoRel } = repoOf(root, f.file, dirCache);

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
          git(gitRoot, ['rm', '--cached', '-q', '--', repoRel]);
          changes.push({ file: f.file, action: 'removed from git, kept on disk' });
        }
        continue;
      }
      if (!existsSync(full)) continue;
      if (!isRegularFile(full)) throw new Error('refusing to write: it is a symbolic link or a special file, not a regular file');
      const text = readFileSync(full, 'utf8');
      let next = null;
      let action = 'cleaned';

      if (f.fix === 'strip') {
        const cleaned = cleanSource(text);
        if (cleaned !== null) {
          const original = originalFromHistory(gitRoot, repoRel, cleaned);
          if (original) {
            safeWrite(root, full, original);
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
        action = r.action;
      }

      if (next !== null && next !== text) {
        safeWrite(root, full, next);
        changes.push({ file: f.file, action });
      }
    } catch (err) {
      changes.push({ file: f.file, action: `could not fix: ${err.message}`, failed: true });
    }
  }

  // If .env files are committed or not ignored, make sure the project's .gitignore keeps them out from now on.
  const envRoots = new Set();
  for (const f of findings) {
    if (f.rule === 'env-not-ignored' || (untrackSecrets && f.rule === 'secret')) envRoots.add(repoOf(root, f.file, dirCache).gitRoot || root);
  }
  for (const dir of envRoots) {
    const gi = path.join(dir, '.gitignore');
    const rel = toPosix(path.relative(root, gi));
    try {
      if (existsSync(gi) && !isRegularFile(gi)) throw new Error('refusing to write: it is a symbolic link or a special file, not a regular file');
      const text = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
      const next = cleanGitignore(text, true);
      if (next !== text) {
        // `dir` is the git repo this file belongs to: its own .gitignore is the one that matters, even
        // when the scanned folder is a subfolder of it. Links and escapes are still refused.
        safeWrite(dir, gi, next);
        changes.push({ file: rel, action: 'now ignores .env files' });
      }
    } catch (err) {
      changes.push({ file: rel, action: `could not fix: ${err.message}`, failed: true });
    }
  }
  return changes;
}
