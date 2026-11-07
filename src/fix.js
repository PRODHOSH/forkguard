import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { PRELUDE, findHiddenTail, findLoader, findMarker, hasPrelude, stripLoader } from './rules.js';
import { fileHistory, git, repoRoot, showFile, toPosix } from './git.js';

/** Cuts the hidden tail off every line that has one. */
function cutHiddenTails(text) {
  let changed = false;
  const lines = text.split('\n').map((line) => {
    if (line.length < 1530) return line;
    const m = /[ \t]{30,}\S/.exec(line);
    if (m && m.index < 400 && line.length - (m.index + m[0].length) >= 1500) {
      changed = true;
      return line.slice(0, m.index).replace(/[ \t]+$/, '') + (line.endsWith('\r') ? '\r' : '');
    }
    return line;
  });
  return changed ? lines.join('\n') : null;
}

/** Removes the fake require() lines and only the blank lines that sit between them. */
function dropPrelude(text) {
  const crlf = text.includes('\r\n');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let removed = false;
  let lastWasPrelude = false;
  lines.forEach((l, i) => {
    if (PRELUDE.has(l.trim())) {
      removed = lastWasPrelude = true;
      return;
    }
    if (!l.trim() && lastWasPrelude) {
      const next = lines.slice(i + 1).find((x) => x.trim());
      if (next && PRELUDE.has(next.trim())) return;
    }
    if (l.trim()) lastWasPrelude = false;
    out.push(l);
  });
  if (removed) while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  const result = out.join('\n') + '\n';
  return crlf ? result.replace(/\n/g, '\r\n') : result;
}

export function cleanSource(text) {
  const loader = findLoader(text);
  const base = loader ? stripLoader(text) : text;
  const cut = cutHiddenTails(base);
  if (cut === null && !hasPrelude(base) && !loader) return null;
  return dropPrelude(cut ?? base);
}

const squash = (s) => s.replace(/\s+/g, '');

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
    const text = old.toString('utf8');
    if (findHiddenTail(text) || findMarker(text) || findLoader(text) || hasPrelude(text) && text.includes('exports: {}')) continue;
    const plain = (s) => squash(s.replace(/^\s*import\s+['"]dotenv\/config['"];?\s*$/m, ''));
    return squash(text) === squash(cleaned) || plain(text) === plain(cleaned) ? old : null;
  }
  return null;
}

function cleanScripts(text) {
  return text
    .replace(/node\s+(\.\/)?init(\.js)?\s*&&\s*/g, '')
    .replace(/\s*&&\s*node\s+(\.\/)?init(\.js)?\b/g, '')
    .replace(/node\s+\S*(fonts?|assets|public)\/\S+\s*&&\s*/g, '');
}

function cleanGitignore(text, hasEnvFiles) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  let lines = text.split(/\r?\n/).filter((l) => !/^\s*(config\.bat|temp_auto_push\.bat)\s*$/.test(l));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (hasEnvFiles && !lines.some((l) => /^\s*\.env/.test(l))) lines.push('', '# env files', '.env*', '!.env.example');
  return lines.join(nl) + nl;
}

function stripJsonComments(s) {
  return s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '').replace(/,(\s*[}\]])/g, '$1');
}

/** Drops only the tasks that run on folder open. Deletes the file if nothing else is left. */
function cleanTasks(text) {
  try {
    const data = JSON.parse(stripJsonComments(text));
    const keep = (data.tasks || []).filter((t) => t?.runOptions?.runOn !== 'folderOpen');
    if (!keep.length) return { remove: true };
    return { text: JSON.stringify({ ...data, tasks: keep }, null, 2) + '\n' };
  } catch {
    return { remove: true };
  }
}

function cleanSettings(text) {
  if (/compile-hero/.test(text) && /allowAutomaticTasks/.test(text)) return { remove: true }; // the malware's own template
  return { text: text.replace(/("task\.allowAutomaticTasks"\s*:\s*)("on"|true)/, '$1"off"') };
}

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
