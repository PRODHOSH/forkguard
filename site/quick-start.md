# Quick start

> From zero to protected in five steps.

## 1. Check the project you are in

Open a terminal inside the project folder and run:

```bash
forkguard
```

A clean project looks like this:

```text
forkguard  my-app looks clean (433 files checked)
```

> **Tip:** For your own repos, run `git pull` first. This malware gets into GitHub, not your laptop, so your local copy can look clean while GitHub has the infected version.

## 2. Read the result

If something is wrong you get a list. Each line has a level, a file and a message:

```text
forkguard  my-app

  HIGH  init                Code hidden after 776 blank spaces on line 35
  HIGH  package.json        "dev" runs a hidden file called init before your real command
  MED   .gitignore          Hides config.bat, a file this malware drops

  3 problems found. Do not run npm install, npm run dev or open this folder in VS Code yet.
  Run forkguard fix to clean it, or forkguard pr to clean it and open a pull request.
```

| Level | Meaning | What to do |
| --- | --- | --- |
| HIGH | Dangerous. It can run by itself and steal from you. | Do not install, run or open the project. Clean it first. |
| MED | Worth a look. It does not run by itself. | Read it and decide. Most can be fixed with `forkguard fix`. |

More in [Reading the results](https://forkguard.pages.dev/guides/read-results/).

## 3. Clean it

```bash
forkguard fix
```

```text
forkguard  cleaning my-app

  done  init                deleted
  done  package.json        cleaned
  done  postcss.config.mjs  restored your original from git history

  Clean now. Review with "git diff", then commit.
```

Look at what changed, then save it:

```bash
git diff
git add -A
git commit -m "Remove injected malware"
```

## 4. Fix it on GitHub too

`forkguard fix` cleans your computer. `forkguard pr` cleans **GitHub** as well, by opening a pull request with the fix:

```bash
gh auth login
forkguard pr
```

Commit or stash your own changes first. Details in [`forkguard pr`](https://forkguard.pages.dev/commands/pr/).

## 5. Turn on automatic protection

```bash
npm install -g forkguard
forkguard setup
```

Close the terminal and open a new one. From now on forkguard checks a project before `npm install`, `npm run dev` and friends, and after `git clone`. When everything is clean you see nothing at all.

## Cheat sheet

| I want to… | Run |
| --- | --- |
| Check this folder | `forkguard` |
| Check another folder | `forkguard path/to/project` |
| Check a GitHub repo without cloning it | `forkguard owner/repo` |
| Check all my repos on GitHub | `forkguard --mine` |
| Clean this folder | `forkguard fix` |
| Clean it on GitHub with a pull request | `forkguard pr` |
| Send the fix to the repo I forked from | `forkguard pr --upstream` |
| Check automatically before npm and after git | `forkguard setup` |
| Turn automatic checks off | `forkguard setup --remove` |
| Skip the check once | `FORKGUARD_SKIP=1 npm install` |
| Get results as JSON | `forkguard --json` |
| Add safety rules for AI agents (next release) | `forkguard agent --write` |
| See the version | `forkguard --version` |

## Where to next

- [forkguard, in full](https://forkguard.pages.dev/commands/check/): Every option of the check command.
- [Reading the results](https://forkguard.pages.dev/guides/read-results/): What each message means.
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): What to do, in order.
- [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/): Never forget to check again.
