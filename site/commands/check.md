# forkguard

> Check a folder for hidden malware. Read only.

## Name

`forkguard` checks a folder for malware hidden in it. It only reads files. It never changes anything.

## Synopsis

```bash
forkguard
forkguard path/to/project
forkguard path/to/project --json
```

- `folder`: The folder to check. Optional. Defaults to the folder you are in.
- `--json`: Print the results as JSON instead of text.

## Description

Checks every file in the folder that this malware is known to use, and reports each problem with a level, a file and a plain-words message. It takes well under a second for a typical project.

### What it reads

- JavaScript and TypeScript files (`.js .mjs .cjs .ts .mts .cts .jsx .tsx .vue .svelte`) and any file named `init`.
- `package.json` and lockfiles (`package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`).
- `.vscode/tasks.json`, `.vscode/settings.json` and `.vscode/extension.json`.
- Font files (`.woff .woff2 .ttf .otf .ttc .eot`) and `README.md` files inside fonts folders.
- Dropped files such as `config.bat` and `temp_auto_push.bat`, and any `.bat`, `.cmd` or `.sh` script.
- `.gitignore`, and `.env` files.

### What it skips

`node_modules`, `.git`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.vercel`, `.output`, `dist`, `build`, `out`, `coverage`, `.cache`, `.parcel-cache`, `vendor`, `__pycache__`, `.venv` and `venv`. These hold generated code rather than yours, and skipping them is what keeps the check fast. Files larger than 6 MB are skipped too.

### When the folder is a git repo

- Reports `.env` files that are already committed, and `.env` files git is not ignoring.
- When a HIGH problem is found, also checks whether your latest commit was rewritten after it was made (same moment, different timezone).

### Always

Checks whether npm itself on your computer is infected, because an infected npm would bring the malware back after every cleanup. It reads npm’s files directly and never runs npm to do it.

## Output

A clean project prints one line:

```text
forkguard  my-app looks clean (433 files checked)
```

A project with problems prints one line per problem:

```text
forkguard  my-app

  HIGH  init          Code hidden after 776 blank spaces on line 35
  HIGH  package.json  "dev" runs a hidden file called init before your real command
  MED   .gitignore    Hides config.bat, a file this malware drops

  3 problems found. Do not run npm install, npm run dev or open this folder in VS Code yet.
  Run forkguard fix to clean it, or forkguard pr to clean it and open a pull request.
```

Each line shows the **level**, the **file** and **what is wrong**. Problems are sorted with the most serious first.

| Level | Meaning |
| --- | --- |
| HIGH | Can run by itself and steal from you. Do not install, run or open the project. |
| MED | Worth a look. Does not run by itself. |

When a problem can be fixed automatically, the last line points you to `forkguard fix` and `forkguard pr`.

## Options

- `--json`: Print `{ root, checked, findings }` as JSON. See [JSON output](https://forkguard.pages.dev/reference/json/).
- `--help`, `-h`: Print all commands.
- `--version`, `-v`: Print the version.

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run, for example a folder that does not exist. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## Environment

- `NO_COLOR=1`: Turn off colors in the output.

## Examples

Check the folder you are in:

```bash
forkguard
```

Check a folder you are not in:

```bash
forkguard ~/projects/take-home-test
```

Use it in a script, and stop if something dangerous is found:

```bash
forkguard --json > report.json || echo "stop: forkguard found something"
```

> **Tip:** Checking a repo you have not cloned yet? Use [`forkguard owner/repo`](https://forkguard.pages.dev/commands/check-repo/). It does not need the files on your disk.

## See also

- [`forkguard owner/repo`](https://forkguard.pages.dev/commands/check-repo/): check a repo without cloning it
- [`forkguard fix`](https://forkguard.pages.dev/commands/fix/): clean what was found
- [What it catches](https://forkguard.pages.dev/reference/rules/): every rule
- [Reading the results](https://forkguard.pages.dev/guides/read-results/)

## Where to next

- [Check a repo without cloning it](https://forkguard.pages.dev/commands/check-repo/): forkguard owner/repo
- [Clean what was found](https://forkguard.pages.dev/commands/fix/): forkguard fix
- [Reading the results](https://forkguard.pages.dev/guides/read-results/): What each message means.
- [Every rule](https://forkguard.pages.dev/reference/rules/): What it catches.
