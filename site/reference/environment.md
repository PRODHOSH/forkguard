# Environment variables

> Four variables. All optional.

| Variable | What it does |
| --- | --- |
| `FORKGUARD_SKIP=1` | Skips the automatic check for one command. Only read by the shell hooks. |
| `GITHUB_TOKEN`, `GH_TOKEN` | Used to talk to GitHub when the GitHub CLI is not available. Needed by `--mine`, and by `pr` for opening the pull request. |
| `NO_COLOR=1` | Turns off colors in the output. |

## Skipping once

Git Bash, macOS or Linux:

```bash
FORKGUARD_SKIP=1 npm install
```

PowerShell:

```powershell
$env:FORKGUARD_SKIP='1'; npm install
```

## A token for GitHub

The GitHub CLI is tried first (`gh auth token`). If it is not installed or not logged in, `GITHUB_TOKEN` and then `GH_TOKEN` are used. A token needs permission to read your repos for `--mine`, and to push and open pull requests for `pr`.

> **Warning:** Never paste a token into a command that is saved in your history, and never commit one. forkguard reads it from the environment and sends it only to `api.github.com`.

## Where to next

- [forkguard setup](https://forkguard.pages.dev/commands/setup/): Where FORKGUARD_SKIP matters.
- [forkguard --mine](https://forkguard.pages.dev/commands/mine/): Where a token matters.
