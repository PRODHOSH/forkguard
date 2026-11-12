// forkguard cleaners: turn an infected file's text into a clean one. Pure string functions with no
// Node-only imports, so the CLI and a GitHub App can share them. Nothing here reads or writes disk.
import { FONT_CMD, INIT_CMD, PRELUDE, findHiddenTail, findLoader, findMarker, hasPrelude, stripLoader } from './rules.js';

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

/** Takes only the injected `node init` / `node fonts/x.ttf` step out of a script, never a neighbouring command. */
export function cleanScripts(text) {
  const lead = (cmd) => new RegExp(`${cmd}\\s*&&\\s*`, 'g');
  const trail = (cmd) => new RegExp(`\\s*&&\\s*${cmd}`, 'g');
  return text
    .replace(lead(INIT_CMD), '').replace(trail(INIT_CMD), '')
    .replace(lead(FONT_CMD), '').replace(trail(FONT_CMD), '');
}

export function cleanGitignore(text, hasEnvFiles) {
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
export function cleanTasks(text) {
  try {
    const data = JSON.parse(stripJsonComments(text));
    const keep = (data.tasks || []).filter((t) => t?.runOptions?.runOn !== 'folderOpen');
    if (!keep.length) return { remove: true };
    return { text: JSON.stringify({ ...data, tasks: keep }, null, 2) + '\n' };
  } catch {
    return { remove: true };
  }
}

export function cleanSettings(text) {
  if (/compile-hero/.test(text) && /allowAutomaticTasks/.test(text)) return { remove: true }; // the malware's own template
  return { text: text.replace(/("task\.allowAutomaticTasks"\s*:\s*)("on"|true)/, '$1"off"') };
}

const squash = (s) => s.replace(/\s+/g, '');

/**
 * Is `old` a clean version of the file we just cleaned? True when it has no malware and its code is the same
 * as `cleaned` (ignoring spacing), which means `old` is the user's exact original and can be put back byte for byte.
 * Only the first clean version in history counts; the caller walks history newest first.
 */
export function isOriginalOf(old, cleaned) {
  if (findHiddenTail(old) || findMarker(old) || findLoader(old) || (hasPrelude(old) && old.includes('exports: {}'))) return null; // still infected: keep looking
  const plain = (s) => squash(s.replace(/^\s*import\s+['"]dotenv\/config['"];?\s*$/m, ''));
  return squash(old) === squash(cleaned) || plain(old) === plain(cleaned);
}

/**
 * What a fix kind does to one file's text. Returns { remove: true }, { text } or { skip: true } when
 * there is nothing safe to do automatically. `fix` is the `fix` field of a finding.
 */
export function applyFix(kind, text, { hasEnvFiles = false } = {}) {
  switch (kind) {
    case 'delete':
    case 'delete-dir': return { remove: true };
    case 'strip': { const cleaned = cleanSource(text); return cleaned === null ? { skip: true } : { text: cleaned }; }
    case 'script': return { text: cleanScripts(text) };
    case 'gitignore': return { text: cleanGitignore(text, hasEnvFiles) };
    case 'autorun': return cleanTasks(text);
    case 'setting': return cleanSettings(text);
    default: return { skip: true };
  }
}
