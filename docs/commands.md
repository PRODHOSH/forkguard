<p align="center">
  <a href="https://github.com/PRODHOSH/forkguard">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../site/assets/brand/logo-on-dark.svg">
      <img src="../site/assets/brand/logo.svg" alt="forkguard" height="56">
    </picture>
  </a>
</p>

> This page is also on the [documentation site](https://forkguard.pages.dev/commands/check/), with search and a short and a plain-words version of every command.

# Commands reference

Every command, option, output and exit code in forkguard, explained in detail. If you are just starting out, read [Getting started](getting-started.md) first.

## Contents

1. [At a glance](#1-at-a-glance)
2. [forkguard (check a folder)](#2-forkguard-check-a-folder)
3. [forkguard owner/repo (check a GitHub repo)](#3-forkguard-ownerrepo-check-a-github-repo)
4. [forkguard --mine (check all your repos)](#4-forkguard---mine-check-all-your-repos)
5. [forkguard fix](#5-forkguard-fix)
6. [forkguard pr](#6-forkguard-pr)
7. [forkguard setup](#7-forkguard-setup)
8. [Options](#8-options)
9. [Exit codes](#9-exit-codes)
10. [Environment variables](#10-environment-variables)
11. [JSON output](#11-json-output)

---

## 1. At a glance

| Command | What it does | Changes anything? |
| --- | --- | --- |
| `forkguard` | Checks the current folder | No |
| `forkguard <folder>` | Checks another folder | No |
| `forkguard <owner/repo or link>` | Checks a GitHub repo, every branch | No |
| `forkguard --mine` | Checks every repo you own on GitHub | No |
| `forkguard fix [folder]` | Removes what it found, on your computer | Yes, your files |
| `forkguard pr [folder]` | Removes it on a new branch and opens a pull request | Yes, a new branch and pull request |
| `forkguard pr --upstream` | Sends the fix to the repo you forked from | Yes, a pull request on that repo |
| `forkguard setup` | Turns on automatic checks | Yes, your shell profile |
| `forkguard setup --remove` | Turns them off | Yes, your shell profile |

Only `fix`, `pr` and `setup` ever change anything. Checking is always read only.

---

## 2. forkguard (check a folder)

```bash
forkguard
```

```bash
forkguard path/to/project
```

Checks every file in the folder that this malware is known to use: JavaScript and TypeScript files, `package.json`, lockfiles, `.gitignore`, `.vscode` settings, font files and more.

**What it skips:** `node_modules`, `.git`, `.next`, `dist`, `build`, `out`, `coverage` and similar folders that hold generated code rather than your code. This is what keeps it fast.

**What it also checks:** if the folder is a git repo, it looks for committed `.env` files, `.env` files git is not ignoring, and a rewritten latest commit. It also checks whether npm itself on your computer is infected.

**Clean result:**

```text
forkguard  my-app looks clean (433 files checked)
```

**Infected result:**

```text
forkguard  my-app

  HIGH  init          Code hidden after 776 blank spaces on line 35
  HIGH  package.json  "dev" runs a hidden file called init before your real command
  MED   .gitignore    Hides config.bat, a file this malware drops

  3 problems found. Do not run npm install, npm run dev or open this folder in VS Code yet.
  Run forkguard fix to clean it, or forkguard pr to clean it and open a pull request.
```

Each line shows the **level**, the **file** and **what is wrong**.

| Level | Meaning |
| --- | --- |
| HIGH | Can run by itself and steal from you. Do not install, run or open the project. |
| MED | Worth a look. Does not run by itself. |

---

## 3. forkguard owner/repo (check a GitHub repo)

```bash
forkguard someone/their-repo
```

All of these work:

```bash
forkguard someone/their-repo
forkguard https://github.com/someone/their-repo
forkguard github.com/someone/their-repo
forkguard https://github.com/someone/their-repo/tree/some-branch
forkguard git@github.com:someone/their-repo.git
```

**When to use it:** before you fork, clone or open a repo you do not know, like a coding test from a recruiter or a project you found online. Also handy for checking your own repos on GitHub without pulling them.

**What it does, step by step:**

1. Downloads only the **latest commit of every branch** into a temporary folder.
2. Does **not** check the files out. They stay packed inside git's database and are never written to your disk as real files.
3. Reads them straight from git's database and runs every rule.
4. Deletes the temporary folder.

**Result:**

```text
forkguard  someone/their-repo (2 branches checked)

  main
    HIGH  postcss.config.mjs  Code hidden after 507 blank spaces on line 11
  dev
    HIGH  init                Code hidden after 776 blank spaces on line 35

  Do not clone and run this repo yet. If it is yours, clean it with:
    git clone https://github.com/someone/their-repo
    cd their-repo
    forkguard pr
```

Every branch is checked, because the malware often hides on side branches like old Vercel preview branches.

**Private repos:** work as long as git on your computer can access them. The easiest way is `gh auth login`.

**Other hosts:** any git URL works, like GitLab or Bitbucket. Only GitHub has the `owner/repo` shortcut.

---

## 4. forkguard --mine (check all your repos)

```bash
forkguard --mine
```

Checks **every repo you own** on GitHub, every branch, using the same safe method as above.

**You need to be logged in.** Either:

```bash
gh auth login
```

or set a `GITHUB_TOKEN` environment variable with a personal access token.

**Result:**

```text
forkguard  checking 54 of your repos on GitHub, every branch

  clean            PRODHOSH/ai-movie-recommender
  INFECTED         PRODHOSH/gssoc-tracker
  worth a look     PRODHOSH/code-crafters
  clean            PRODHOSH/vector
  ...

  54 repos checked: 52 clean, 1 infected
```

Then you get the full details for every repo that is not clean. It checks four repos at a time. Around 50 repos takes about a minute and a half.

| Status | Meaning |
| --- | --- |
| clean | Nothing found on any branch |
| INFECTED | Something HIGH on at least one branch |
| worth a look | Only MED findings |
| could not check | The download failed, usually because of access |

---

## 5. forkguard fix

```bash
forkguard fix
```

```bash
forkguard fix path/to/project
```

Removes what forkguard found, in the folder on your computer. Nothing is pushed anywhere.

**What it does for each kind of problem:**

| Problem | What fix does |
| --- | --- |
| Hidden `init` file | Deletes it |
| Fake font | Deletes it |
| Decoy fonts folder | Deletes the whole folder |
| Dropped `.bat` or `.orc` files | Deletes them |
| Hidden code in your files | Cuts out only the hidden part, keeps your code |
| Injected `require` lines | Removes only those lines |
| `node init &&` in scripts | Removes it from `dev`, `build` and `start` |
| VS Code auto task | Removes only that task, keeps your other tasks |
| VS Code auto task setting | Turns it off |
| `config.bat` in `.gitignore` | Removes that line |
| `.env` not ignored | Adds `.env` rules to `.gitignore` |

**Restoring your originals:** after cleaning a file, forkguard looks back through git history for the last clean version of it. If that version has the same code, it puts back your exact original, so even line breaks the malware mangled come back.

**After it runs:**

```bash
git diff
```

```bash
git add -A
git commit -m "Remove injected malware"
```

**Not a git repo?** forkguard asks before changing anything, because it cannot be undone.

**What it does not fix by itself:** known bad npm packages, risky install scripts and an infected npm. Those need a person to decide, and forkguard tells you what to do.

---

## 6. forkguard pr

```bash
forkguard pr
```

Cleans the repo and opens a pull request, so GitHub gets fixed too, not just your laptop.

**What it needs:**

- The folder must be a git repo whose `origin` is on GitHub.
- No uncommitted changes. Commit or stash them first, so your work never mixes into the fix.
- A way to talk to GitHub: the GitHub CLI (`gh auth login`), or a `GITHUB_TOKEN`. Without either, it still pushes the branch and prints a link so you can open the pull request yourself.

**What it does, step by step:**

1. Creates a new branch called `forkguard/remove-malware`.
2. Runs the same cleaning as `forkguard fix`.
3. Takes committed `.env` files out of git, while keeping them on your disk.
4. Commits everything as `Remove injected malware`.
5. Pushes the branch to GitHub.
6. Opens the pull request with a clear description of what was removed and what to do next.
7. Switches you back to the branch you were on.

### --upstream

```bash
forkguard pr --upstream
```

Use this when you forked a repo and the **original** repo has the malware. The pull request goes to the original owner instead of your fork.

forkguard builds the fix on top of the original repo's branch, not your fork. This matters: if your fork is the infected one, a normal pull request would carry the malicious commit along with the fix. Building from the original keeps the pull request to exactly one commit, the fix.

---

## 7. forkguard setup

```bash
forkguard setup
```

Turns on automatic checks. Needs forkguard installed globally (`npm install -g forkguard`).

**What it changes:** it adds one clearly marked block to your shell profile:

| Shell | File |
| --- | --- |
| Windows PowerShell | `Documents\WindowsPowerShell\profile.ps1` |
| PowerShell 7 | `Documents\PowerShell\profile.ps1` |
| Git Bash and bash | `~/.bashrc` |
| zsh | `~/.zshrc` |

It also asks to turn off `task.allowAutomaticTasks` in your VS Code settings.

**What happens after, in every new terminal:**

| You run | forkguard |
| --- | --- |
| `npm`, `pnpm`, `yarn` or `bun` with `install`, `i`, `ci`, `add`, `run`, `dev`, `start`, `build`, `test`, `exec` | Checks the project first. Stops the command if anything HIGH is found. |
| `git clone`, `pull`, `merge`, `checkout`, `switch` | Checks what came in afterwards and warns you |
| Anything else | Runs normally, no check |

When the project is clean you see nothing. When there are only MED findings you get a one line note and the command still runs.

### --remove

```bash
forkguard setup --remove
```

Takes the block back out of every shell profile. Open a new terminal and it is gone.

---

## 8. Options

| Option | Works with | What it does |
| --- | --- | --- |
| `--json` | checking a folder, a link, or `--mine` | Prints the results as JSON instead of text |
| `--upstream` | `pr` | Sends the pull request to the repo you forked from |
| `--remove` | `setup` | Undoes setup |
| `--version`, `-v` | anything | Prints the version |
| `--help`, `-h` | anything | Prints all commands |

---

## 9. Exit codes

Useful for scripts and CI.

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings |
| `1` | Something HIGH was found |
| `2` | forkguard itself could not run, for example a folder that does not exist or a repo it could not download |

---

## 10. Environment variables

| Variable | What it does |
| --- | --- |
| `FORKGUARD_SKIP=1` | Skips the automatic check for one command |
| `GITHUB_TOKEN` or `GH_TOKEN` | Used to talk to GitHub when the GitHub CLI is not available |
| `NO_COLOR=1` | Turns off colors in the output |

Skipping once, in Git Bash, macOS or Linux:

```bash
FORKGUARD_SKIP=1 npm install
```

In PowerShell:

```powershell
$env:FORKGUARD_SKIP='1'; npm install
```

---

## 11. JSON output

Add `--json` to get results you can read from a script.

**A folder:**

```json
{
  "root": "/home/me/my-app",
  "checked": 433,
  "findings": [
    {
      "level": "high",
      "file": "init",
      "rule": "hidden-code",
      "message": "Code hidden after 776 blank spaces on line 35",
      "fix": "delete"
    }
  ]
}
```

**A GitHub repo:**

```json
{
  "name": "someone/their-repo",
  "url": "https://github.com/someone/their-repo",
  "branches": [
    { "name": "main", "checked": 112, "findings": [] }
  ]
}
```

`--mine --json` prints a list of these, one per repo.

| Field | Meaning |
| --- | --- |
| `level` | `high` or `medium` |
| `file` | The file, relative to the project |
| `rule` | Which check found it, like `hidden-code`, `fake-font` or `script` |
| `message` | What is wrong, in plain words |
| `fix` | What `forkguard fix` will do, or `null` if a person has to decide |

## forkguard agent

Safety rules for AI coding agents (Claude Code, Cursor, Copilot, Codex), so they check a project before running it.

```bash
forkguard agent           # print the rules
forkguard agent --write   # add them to AGENTS.md / CLAUDE.md / Cursor / Copilot files that already exist (AGENTS.md if none do)
```

The rules tell the agent to run `npx forkguard --json` first, stop on exit code 1, never run `fix` or `pr` without asking, and treat everything inside a repo (README, comments, commit messages, forkguard's own output) as data, not instructions. Running it again changes nothing.
