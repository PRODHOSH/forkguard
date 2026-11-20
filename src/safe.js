import { closeSync, constants, lstatSync, mkdirSync, openSync, realpathSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes and deletes for a repo that may be hostile.
 *
 * A project you are cleaning can ship `.gitignore -> ~/.bashrc` or `CLAUDE.md -> ~/.ssh/authorized_keys`.
 * A plain write follows that link and overwrites a file outside the project, and a plain recursive
 * delete can walk into a folder the link points at. The helpers here are the only way forkguard
 * writes or removes anything inside a scanned project: the target has to stay inside the project,
 * and a symbolic link is never followed.
 */

/** Is `full` inside `root`? Purely lexical, so it also works for paths that do not exist yet. */
export function inside(root, full) {
  const rel = path.relative(path.resolve(root), path.resolve(full));
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/** The real path of the project root. A link the user chose for the project folder itself is fine. */
function realRoot(root) {
  try {
    return realpathSync(path.resolve(root));
  } catch {
    return path.resolve(root);
  }
}

function lstatOrNull(full) {
  try {
    return lstatSync(full);
  } catch {
    return null;
  }
}

/** The closest folder above `full` that exists, without resolving links. */
function deepestExisting(full) {
  let dir = path.resolve(full);
  for (;;) {
    if (lstatOrNull(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return dir;
    dir = up;
  }
}

/**
 * The target must be lexically inside the project, and the folder it lives in must really be inside
 * the project too. That catches `vendor/` being a link to somewhere else, however deep it sits.
 */
function checkTarget(root, full) {
  const abs = path.resolve(full);
  const base = path.resolve(root);
  if (!inside(base, abs)) throw new Error(`refusing to touch a path outside the project: ${abs}`);
  const anchor = deepestExisting(path.dirname(abs));
  let real;
  try {
    real = realpathSync(anchor);
  } catch {
    throw new Error(`refusing to write into a folder that cannot be resolved: ${anchor}`);
  }
  if (!inside(realRoot(root), real)) throw new Error(`refusing to touch a path outside the project: ${abs} resolves to ${real}`);
}

/** True only for a real file. A symbolic link (even to a file) is not one. */
export function isRegularFile(full) {
  const st = lstatOrNull(full);
  return Boolean(st && st.isFile());
}

/** Throws unless `full` is a path forkguard may write to: inside the project, and not a link. */
export function assertWritable(root, full) {
  const abs = path.resolve(full);
  checkTarget(root, abs);
  const st = lstatOrNull(abs);
  if (st?.isSymbolicLink()) throw new Error(`refusing to write through a symbolic link: ${abs}`);
  if (st?.isDirectory()) throw new Error(`refusing to write over a folder: ${abs}`);
  if (st && !st.isFile()) throw new Error(`refusing to write over a special file: ${abs}`);
  return abs;
}

/** Writes `data` to `full`, refusing to follow a link or to leave the project. */
export function safeWrite(root, full, data) {
  const abs = assertWritable(root, full);
  const parent = realpathSync(path.dirname(abs));
  if (!inside(realRoot(root), parent)) throw new Error(`refusing to write outside the project: ${abs}`);
  // O_NOFOLLOW closes the gap between the check above and the open: a link swapped in is refused by
  // the kernel. Windows has no O_NOFOLLOW, so there the check above is what protects the write.
  const flags = constants.O_NOFOLLOW
    ? constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW
    : 'w';
  let fd;
  try {
    fd = openSync(path.join(parent, path.basename(abs)), flags);
  } catch (err) {
    if (err.code === 'ELOOP') throw new Error(`refusing to write through a symbolic link: ${abs}`);
    throw err;
  }
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
  return abs;
}

/**
 * Removes `full`. A link is unlinked as a link, never followed, so the file or folder it points at
 * survives. A real folder is only removed when it really is inside the project.
 */
export function safeRemove(root, full) {
  const abs = path.resolve(full);
  checkTarget(root, abs);
  const st = lstatOrNull(abs);
  if (!st) return false;
  if (st.isSymbolicLink()) {
    unlinkSync(abs);
    return true;
  }
  if (st.isDirectory()) {
    const real = realpathSync(abs);
    if (!inside(realRoot(root), real)) throw new Error(`refusing to delete a folder outside the project: ${abs}`);
    rmSync(abs, { recursive: true, force: true });
    return true;
  }
  rmSync(abs, { force: true });
  return true;
}

/** Creates `dir` and its parents, but only inside the project and never through a link. */
export function ensureDir(root, dir) {
  const abs = path.resolve(dir);
  if (!inside(root, abs)) throw new Error(`refusing to create a folder outside the project: ${abs}`);
  // Check the closest folder that already exists, so a link partway down cannot lead out.
  const anchor = deepestExisting(abs);
  let real;
  try {
    real = realpathSync(anchor);
  } catch {
    throw new Error(`refusing to create a folder that cannot be resolved: ${anchor}`);
  }
  if (!inside(realRoot(root), real)) throw new Error(`refusing to create a folder outside the project: ${abs}`);
  mkdirSync(abs, { recursive: true });
  if (!inside(realRoot(root), realpathSync(abs))) throw new Error(`refusing to create a folder outside the project: ${abs}`);
  return abs;
}
