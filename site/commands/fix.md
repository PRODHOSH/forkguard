# forkguard fix

> Remove what forkguard found, on your computer, and get your original files back.

## Name

`forkguard fix` removes the malware forkguard found in a folder, and restores your original files from git history where it can. Nothing is pushed anywhere.

## Synopsis

```bash
forkguard fix
forkguard fix path/to/project
```

## Description

Runs a check, then applies the fix for every problem that has one. Cutting off the hidden code is the easy part. The malware also adds fake `require` lines to the top of files and sometimes mangles line breaks, so fix handles all of it and then checks again.

| Problem | What fix does |
| --- | --- |
| Hidden `init` file | Deletes it |
| Fake font | Deletes it |
| Decoy fonts folder | Deletes the whole folder |
| Dropped `.bat` or `.orc` files, history-rewriting scripts | Deletes them |
| Hidden code in one of your files | Cuts out only the hidden part and keeps your code |
| Env-variable loader block | Removes only that block |
| Injected `require` lines | Removes only those lines |
| `node init &&` or a font file run in a script | Removes only that step from `dev`, `build` and `start` |
| VS Code auto-run task | Removes only that task and keeps your other tasks |
| VS Code automatic tasks setting | Turns it off |
| `config.bat` in `.gitignore` | Removes that line |
| `.env` not ignored | Adds `.env*` rules to `.gitignore` |

### Restoring your originals

After cleaning a file, forkguard looks back through git history for the last clean version of it. If that version has the same code (ignoring spacing), it puts back your **exact original**, so even line breaks the malware mangled come back.

### What it does not fix by itself

- A known bad npm package, a risky install script, an already installed bad package, and an infected npm. These need a person to decide, and forkguard tells you what to do.
- A file that matches a known signature but has nothing it can safely cut. It is left as is and reported again as “Still needs a look”.
- Committed `.env` files stay on disk and in git. [`forkguard pr`](https://forkguard.pages.dev/commands/pr/) takes them out of git for you.

> **Warning:** Not a git repo? There is no history to undo from, so forkguard asks “Continue? (y/N)” before changing anything.

## Output

```text
forkguard  cleaning my-app

  done  init                deleted
  done  package.json        cleaned
  done  postcss.config.mjs  restored your original from git history

  Clean now. Review with "git diff", then commit.
```

| Word | What happened |
| --- | --- |
| `deleted` | The file was nothing but malware, so it is gone. |
| `cleaned` | The file is yours. Only the bad part was removed. |
| `restored your original from git history` | forkguard found the clean version you wrote before the attack and put it back exactly. |
| `removed the auto-run task`, `turned automatic tasks off` | A VS Code task or setting was changed. |

If something is left, you get “Still needs a look” with the remaining findings.

## After it runs

Look at what changed, then save it:

```bash
git diff
git add -A
git commit -m "Remove injected malware"
```

Want GitHub fixed too, not just your laptop? Use [`forkguard pr`](https://forkguard.pages.dev/commands/pr/) instead.

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run, for example a folder that does not exist. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## Examples

```bash
forkguard fix
```

```bash
forkguard fix ~/projects/old-site
```

> **Tip:** Run `forkguard` first if you want to see what will change before anything does.

## See also

- [`forkguard pr`](https://forkguard.pages.dev/commands/pr/)
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/)
- [How fixing works](https://forkguard.pages.dev/internals/how-it-works/)

## Where to next

- [Open a pull request](https://forkguard.pages.dev/commands/pr/): forkguard pr
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): The full checklist.
- [Every rule](https://forkguard.pages.dev/reference/rules/): What fix does for each one.
