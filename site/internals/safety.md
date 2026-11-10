# Safety and privacy

> What forkguard never does, and what it cannot do.

## What it never does

- **It never runs code from the project it checks.** It only reads files.
- **It switches off git hooks** every time it calls git, because an infected repo can ship its own.
- **It never runs npm** to check npm. It reads npm’s files directly.
- **It never writes a downloaded repo’s files to disk.** Link checks keep everything packed inside git and delete it afterwards.
- **It never uploads your code.** Nothing you check leaves your machine.
- **It has no telemetry and no account.**
- **It has zero dependencies.** There is nothing between you and the check that could be compromised.

## What goes over the network

| When | Where to | What |
| --- | --- | --- |
| `forkguard owner/repo`, `--mine` | The git host of the repo (for example github.com) | A shallow clone of the repo you asked to check. |
| `--mine`, `pr` | `api.github.com` | Listing your repos, and opening a pull request. Your token is sent only here. |
| `pr` | Your `origin` remote | Pushing the fix branch. |
| Everything else | Nowhere | Folder checks, `fix`, `setup`, `agent` and `--help` are completely offline. |

## What it changes on your machine

| Command | Changes |
| --- | --- |
| `forkguard`, `forkguard owner/repo`, `--mine` | Nothing. Read only. (A link check uses a temporary folder that it deletes.) |
| `forkguard fix` | Files in the folder you point it at, only the ones it reported. |
| `forkguard pr` | A new branch and commit, a push to `origin`, and a pull request. Your starting branch is restored. |
| `forkguard setup` | One marked block in your shell profile(s), and optionally one VS Code setting. |
| `forkguard agent --write` | A marked block in AGENTS.md and similar files in the folder you point it at. |

## What it cannot do

- **It only knows the tricks it knows.** A clean result means none of those tricks are present. It is not a sandbox, and it does not replace antivirus.
- **It skips generated folders.** Malware committed only inside `dist`, `build`, `out`, `vendor` or `node_modules` is not seen.
- **It cannot undo what already ran.** If you ran an infected project before checking, rotate your tokens and keys from another device. See [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/).
- **It cannot stop a command in git.** The git hook checks after the command, so it warns, it does not block.
- **Reading is not the same as understanding.** Some findings (a bad package, an install script) need a person to decide.

## Reporting a problem in forkguard itself

If you find a security problem in forkguard, please email **hello@prodhosh.me** instead of opening a public issue. You will get a reply within a few days and credit in the release notes if you like. See the [security policy](https://github.com/PRODHOSH/forkguard/blob/main/SECURITY.md).

## Where to next

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): If you already ran it.
- [How it works](https://forkguard.pages.dev/internals/how-it-works/): The details.
