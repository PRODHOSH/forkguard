# How it works

> The details behind the scenes. You do not need any of this to use forkguard.

## The attack it stops

forkguard was built against a malware campaign researchers call **PolinRider**. This is how it spreads:

1. A developer runs a fake coding test, or installs a bad package.
2. The malware steals their GitHub token.
3. It rewrites the latest commit in every repo it can reach.
4. The next person opens the repo, or runs `npm install`.
5. Repeat.

It is hard to spot because:

- The code sits after hundreds of spaces at the end of a normal line, so editors show nothing.
- The rewritten commit keeps the same author, date and message, so git history looks untouched.
- It also hides in fake font files, in VS Code tasks that run when a folder opens, and even inside npm itself.

## How a check works

`forkguard` walks the folder, skips folders that hold generated code, and runs every rule on each file that could matter. A file is only read if its name or extension makes it interesting (source files, `package.json`, lockfiles, `.vscode` files, fonts, scripts, `.gitignore`, `.env`). Files over 6 MB are skipped.

- **Hidden code** is found by looking for a very long line with a run of spaces near its start and a long tail after it.
- **Known signatures** are plain string matches. The marker strings are kept split in the source, so forkguard never matches its own rules and antivirus tools do not mistake its source for the real thing.
- **The env loader** is a bounded pattern: a small async block that decodes `process.env`, downloads and runs the result.
- **package.json** is parsed as JSON. Scripts and dependencies are checked as data, not text.
- **A rewritten commit** is spotted because author time and commit time are the same moment written in two timezones.

Every rule is listed in [What it catches](https://forkguard.pages.dev/reference/rules/).

## How fixing works

Cutting off the hidden code is the easy part. The malware also adds fake `require` lines to the top of files and sometimes mangles line breaks. `forkguard fix` handles all of it:

1. Problem found.
2. Is the whole file malware? Then delete it.
3. Otherwise it is your file: cut the hidden code and the injected lines.
4. Look for a clean version of the file in git history. If one exists with the same code, restore your exact original bytes.
5. If not, keep the cleaned file.

- **Deleted:** `init` files, fake fonts, decoy folders, dropped `.bat` files, auto-run tasks.
- **Cleaned:** your config files and scripts. Only the bad part is removed. Your code and blank lines stay as they were.
- **Restored:** when git has an older clean version with the same code (ignoring spacing), you get back exactly what you wrote, line breaks included.

Afterwards it checks again and tells you what is left.

## How the pull request works

1. `forkguard pr`: create a new branch.
2. Check and clean, the same as `fix`.
3. Commit “Remove injected malware”.
4. Push the branch to GitHub.
5. Open the pull request.
6. Switch you back to your branch.

**Why `--upstream` builds from the original repo:** if your fork is the infected one, a normal pull request from your fork would carry the malicious commit along with the fix. Building on top of the original keeps the pull request to exactly one commit, the fix.

**How it logs in:** it tries the GitHub CLI first, then a `GITHUB_TOKEN`. If neither is there, it still pushes the branch and prints the link to open the pull request yourself.

## How checking a GitHub link works

`forkguard owner/repo` and `forkguard --mine` check repos on GitHub without ever writing their files to your disk.

1. **A shallow, no-checkout clone.** forkguard runs `git clone --no-checkout --depth 1 --no-single-branch` into a temporary folder. That fetches only the newest commit of each branch, which is small and fast. `--no-checkout` means the files are never unpacked onto your disk, so there is nothing an editor, an antivirus scan or a stray double click could run.
2. **Search inside git.** It uses `git grep` to search every code file on a branch for the malware’s fingerprints in one pass, so even repos with thousands of files take a few seconds.
3. **Read only what matters.** It reads the suspicious files, plus every `package.json`, lockfile, font and VS Code file, straight out of git’s database with `git cat-file`.
4. **The same rules.** It runs exactly the same checks as a folder scan, so a link check and a local check never disagree.
5. **One check per commit.** Branches that point at the same commit are only checked once.
6. **Clean up.** The temporary folder is deleted, whether the check passed or failed.

`--mine` lists your repos through the GitHub CLI or the GitHub API, then runs this for four repos at a time.

## How automatic checks work

`forkguard setup` adds a block to your shell profile that wraps `npm`, `pnpm`, `yarn`, `bun` and `git` as shell functions. For package managers the function calls `forkguard --gate <tool> <args>` first and only continues if it did not exit with `1`. For git it runs the real command, then checks. Details in [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/).

## Architecture

| File | Job |
| --- | --- |
| `bin/forkguard.js` | Reads your command and runs the right part. Also the shell gate. |
| `src/rules.js` | Everything forkguard knows about the malware. |
| `src/scan.js` | Walks the project and runs every rule on each file. |
| `src/remote.js` | Checks GitHub repos and `--mine` straight from git’s database. |
| `src/fix.js` | Removes problems and restores original files. |
| `src/pr.js` | Creates the branch, commit, push and pull request. |
| `src/setup.js` | Installs and removes the shell hooks. |
| `src/agent.js` | Prints and writes the agent rules (next release). |
| `src/git.js` | Talks to git, always with hooks switched off. |
| `src/report.js` | Prints the results. |

`scan.js` and `remote.js` share one `inspect` function, so a folder check and a link check can never disagree.

## Tech stack

| Part | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 18+ | Every JavaScript developer already has it. |
| Dependencies | None | A tool you run before `npm install` should not need `npm install`. |
| Git | The `git` you already have | Reads history to restore your files. |
| Pull requests | GitHub CLI or the GitHub API | Works with however you are logged in. |
| Tests | `node:test` | Built into Node. |
| CI | Linux, Windows and macOS on Node 18, 20 and 22 | The malware targets all three. |

## Where to next

- [Every rule](https://forkguard.pages.dev/reference/rules/): What it catches.
- [Safety and privacy](https://forkguard.pages.dev/internals/safety/): What it never does.
- [Commands](https://forkguard.pages.dev/commands/check/): Start with the check.
