# forkguard owner/repo

> Check a repo on GitHub, every branch, without writing its files to your disk.

## Name

`forkguard owner/repo` checks a repo on GitHub, every branch, without checking its files out onto your disk.

## Synopsis

```bash
forkguard someone/their-repo
forkguard https://github.com/someone/their-repo
forkguard git@github.com:someone/their-repo.git
forkguard someone/their-repo --json
```

## Accepted forms

All of these check the same repo:

```bash
forkguard someone/their-repo
forkguard https://github.com/someone/their-repo
forkguard github.com/someone/their-repo
forkguard https://github.com/someone/their-repo/tree/some-branch
forkguard git@github.com:someone/their-repo.git
```

A link to a branch, a file or a pull request is trimmed to the repo, and **every** branch is still checked. Any git URL (`https://`, `ssh://`, `git://`, `git@host:`) works, so GitLab and Bitbucket are fine. Only GitHub has the `owner/repo` shortcut.

> **Note:** `owner/repo` is read as a GitHub repo only when no folder with that name exists. If you mistype a folder path such as `forkguard fix scr/lib`, you get “No such folder”, not a download attempt.

## Description

Use it before you fork, clone or open a repo you do not know, like a coding test from a recruiter or a project you found online. It is also a quick way to check your own repos on GitHub without pulling them.

### What it does

1. Downloads only the **latest commit of every branch** into a temporary folder.
2. Does **not** check the files out. They stay packed inside git’s database, so nothing from the repo lands on your disk as a real file.
3. Searches and reads them straight from git’s database, and runs the same rules as a folder check.
4. Deletes the temporary folder, whether the check passed or failed.

Every branch is checked, because the malware often hides on side branches such as old Vercel preview branches. Branches that point at the same commit are checked once.

### Limits

Files larger than 6 MB are skipped, like a folder check. Folders such as `node_modules` and `dist` are skipped, so malware committed only inside build output is not seen.

## Output

```text
forkguard  someone/their-repo looks clean (3 branches checked)
```

When something is found, each branch is listed:

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

If there are only MED findings it says “Nothing that runs on its own, but worth a look.”

## Options

- `--json`: Print `{ name, url, branches: [{ name, checked, findings }] }` as JSON. See [JSON output](https://forkguard.pages.dev/reference/json/).

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run, for example when the repo could not be downloaded. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## Notes

### Private repos

They work as long as git on your computer can access them. The easiest way is `gh auth login`. Git never prompts for a password in the middle of a check: if access is missing, the check fails with “could not download”.

### Why it is safe to point at a hostile repo

- Nothing is checked out, so there is no file for an editor, an antivirus scan or a stray double click to run.
- Git hooks are switched off for every git call, because an infected repo can ship its own.
- No code from the repo is ever executed.

## Examples

Check a coding test before you clone it:

```bash
forkguard recruiter/take-home-test
```

Clone only if it was clean:

```bash
forkguard recruiter/take-home-test && git clone https://github.com/recruiter/take-home-test
```

Check a GitLab repo:

```bash
forkguard https://gitlab.com/someone/project.git
```

## See also

- [`forkguard --mine`](https://forkguard.pages.dev/commands/mine/)
- [Check a repo before you clone it](https://forkguard.pages.dev/guides/before-you-clone/)
- [How checking a link works](https://forkguard.pages.dev/internals/how-it-works/)

## Where to next

- [Check every repo you own](https://forkguard.pages.dev/commands/mine/): forkguard --mine
- [Before you clone](https://forkguard.pages.dev/guides/before-you-clone/): A safe routine for unknown repos.
- [Clean it](https://forkguard.pages.dev/commands/fix/): forkguard fix
