# Environment variables

> All optional. Keys and tokens belong here, never in the command.

| Variable | What it does |
| --- | --- |
| `FORKGUARD_SKIP=1` | Skips the automatic check for one command. Only read by the shell hooks. |
| `FORKGUARD_NO_NPM_CHECK=1` | Does not look at npm itself on this computer. For test runs and containers. Leave it off in normal use: an infected npm restarts the malware on every command. |
| `GITHUB_TOKEN`, `GH_TOKEN` | Used to talk to GitHub when the GitHub CLI is not available. Needed by `--mine`, and by `pr` for opening the pull request. |
| `NO_COLOR=1` | Turns off colors in the output. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Your own key for `forkguard skills --ai`. Never typed into the command, never saved, never printed. |
| `FORKGUARD_AI=1` | Runs the AI review in the `npx skills add` install guard too. |
| `FORKGUARD_AI_PROVIDER`, `FORKGUARD_AI_MODEL` | Choose `anthropic`, `openai` or `ollama`, and the model. Defaults are `claude-sonnet-5-5` and `gpt-5.4`. |
| `FORKGUARD_AI_BASE_URL`, `FORKGUARD_AI_API_KEY` | An OpenAI-compatible server such as Ollama on your own computer, and its key if it needs one. |
| `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL` | A proxy or gateway for those providers. |
| `FORKGUARD_SKILLS_STRICT=1` | Same as `--strict` for skills. |

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

## A key for the AI review

Set it as an environment variable in your own terminal, then add `--ai`. macOS, Linux and Git Bash: `export ANTHROPIC_API_KEY=your-key`. PowerShell: `$env:ANTHROPIC_API_KEY = "your-key"`. forkguard reads it for that run, never saves it and never prints it. Run `--ai` with no key set and it shows these steps for your computer. See [`forkguard skills`](https://forkguard.pages.dev/commands/skills/).

## Where to next

- [forkguard setup](https://forkguard.pages.dev/commands/setup/): Where FORKGUARD_SKIP matters.
- [forkguard --mine](https://forkguard.pages.dev/commands/mine/): Where a token matters.
