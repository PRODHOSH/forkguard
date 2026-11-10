# forkguard pr

> Clean the repo on a new branch and open a pull request, so GitHub gets fixed too.

## Name

`forkguard pr` cleans a repo on a new branch, pushes it and opens a pull request, so GitHub is fixed too and not just your laptop.

## Synopsis

```bash
forkguard pr
forkguard pr path/to/project
forkguard pr --upstream
```

## Requirements

- The folder is a git repo whose `origin` is on GitHub.
- No uncommitted changes to tracked files. Commit or stash them first, so your work never mixes into the fix. (Untracked files are fine.)
- You are on a branch, not in a detached HEAD.
- A way to talk to GitHub: the GitHub CLI (`gh auth login`) or a `GITHUB_TOKEN`. Without either, forkguard still pushes the branch and prints a link so you can open the pull request yourself.

## Description

Here is everything it does, in order:

1. Creates a new branch called `forkguard/remove-malware` (or `-2`, `-3` if that name is taken).
2. Runs the same cleaning as [`forkguard fix`](https://forkguard.pages.dev/commands/fix/).
3. Takes committed `.env` files out of git while keeping them on your disk.
4. Commits everything as “Remove injected malware”.
5. Pushes the branch to GitHub.
6. Opens the pull request with a description of what was removed and what to do next.
7. Switches you back to the branch you were on.

The pull request tells reviewers what the malware does and what to do after merging: rotate tokens and keys from another device, block force pushes on the default branch, and run an antivirus scan.

### --upstream

Use this when you forked a repo and the **original** repo has the malware. The pull request goes to the original owner instead of your fork.

forkguard builds the fix on top of the original repo’s default branch, not your fork. This matters: if your fork is the infected one, a normal pull request would carry the malicious commit along with the fix. Building from the original keeps the pull request to exactly one commit, the fix. If the repo is not a fork, you get an error telling you to run `forkguard pr` without `--upstream`.

## Output

```text
forkguard  cleaning you/old-project on a new branch forkguard/remove-malware

  done  init                deleted
  done  postcss.config.mjs  restored your original from git history

  Pushing forkguard/remove-malware to you/old-project

  Pull request opened: https://github.com/you/old-project/pull/12
```

If it could not open the pull request itself, it still pushes and prints a link:

```text
  Branch pushed. Open the pull request here:
  https://github.com/you/old-project/compare/main...you:forkguard/remove-malware?expand=1
```

## Notes

- **Nothing to clean:** prints “has nothing to clean.” and leaves no branch behind.
- **Only never-committed files:** when the only problem was a dropped file that was never committed (for example an untracked `config.bat`), it is deleted from your folder and forkguard says there is nothing to put in a pull request.
- **Your work is safe:** the fix is built on a fresh branch. If anything fails before the commit, forkguard resets that branch, switches you back and deletes it.
- **Secrets:** committed `.env` files are removed from git (`git rm --cached`) but kept on your disk, and `.gitignore` is updated so they stay out.

### Errors you may see

| Message | What to do |
| --- | --- |
| This folder is not a git repo | Use [`forkguard fix`](https://forkguard.pages.dev/commands/fix/) instead. |
| The origin remote is not on GitHub | `forkguard pr` only works with repos on GitHub. Use `forkguard fix`. |
| You have uncommitted changes | Run `git stash`, try again, then `git stash pop`. |
| You are not on a branch | Switch to the branch you want to clean first. |
| … is not a fork, so there is no upstream | Run `forkguard pr` without `--upstream`. |
| Nothing could be fixed automatically | The findings need a person. Run `forkguard` to read them. |

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run, for example a failed push. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## Examples

Fix your own repo:

```bash
gh auth login
git stash          # only if you have unsaved work
forkguard pr
git stash pop
```

Send the fix to the repo you forked from:

```bash
forkguard pr --upstream
```

| You want to… | Run |
| --- | --- |
| Clean your own repo on GitHub | `forkguard pr` |
| Send the fix to the repo you forked from | `forkguard pr --upstream` |

## See also

- [`forkguard fix`](https://forkguard.pages.dev/commands/fix/)
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/)
- [GitHub Action](https://forkguard.pages.dev/guides/github-action/): open the fix automatically

## Where to next

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): Rotate secrets, block force pushes.
- [Check every push](https://forkguard.pages.dev/guides/github-action/): Open the fix automatically with the GitHub Action.
- [forkguard fix](https://forkguard.pages.dev/commands/fix/): Clean locally only.
