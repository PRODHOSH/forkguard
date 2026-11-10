# forkguard setup

> Check automatically before npm install and after git clone.

## Name

`forkguard setup` turns on automatic checks: forkguard looks at a project before `npm install`, `npm run dev` and similar commands, and after `git clone` and `git pull`.

## Synopsis

```bash
forkguard setup
forkguard setup --remove
```

## Description

Needs forkguard installed globally (`npm install -g forkguard`), because your shell has to find it. It adds one clearly marked block to your shell profile:

| Shell | File |
| --- | --- |
| Windows PowerShell | `Documents\WindowsPowerShell\profile.ps1` |
| PowerShell 7 | `Documents\PowerShell\profile.ps1` |
| Git Bash and bash | `~/.bashrc` |
| zsh | `~/.zshrc` |

The block is wrapped in `# >>> forkguard >>>` and `# <<< forkguard <<<` lines, so it can be found and removed cleanly. Run setup again any time: it replaces the block instead of adding a second one.

Setup also asks: “Also stop VS Code from running tasks by itself when you open a folder? (Y/n)”. Press Enter for yes. That is the setting this malware uses to start the moment you open a folder. It sets `task.allowAutomaticTasks` to `"off"` in your VS Code user settings (VS Code only).

> **Warning:** Close the terminal and open a new one. Setup only takes effect in new terminals.

## What happens afterwards

| You run | forkguard |
| --- | --- |
| `npm`, `pnpm`, `yarn` or `bun` with `install`, `i`, `ci`, `add`, `run`, `dev`, `start`, `build`, `test`, `exec` (and `dlx`, `x`, `rebuild` where the tool has them) | Checks the project first. Stops the command if anything HIGH is found. |
| `git clone`, `pull`, `merge`, `checkout`, `switch` | Checks what came in afterwards and warns you. It cannot undo the command, which has already happened. |
| Anything else, like `npm --version` or `git status` | Runs normally, with no check. |

When the project is clean you see nothing. When there are only MED findings you get a one-line note and the command still runs. When something is HIGH:

```text
forkguard  my-app

  HIGH  init  Code hidden after 776 blank spaces on line 35

  Stopped "npm install" so nothing in this project runs.
  To run it anyway: FORKGUARD_SKIP=1 npm install
```

### It is skipped when…

- You install a package **globally** (`-g`, `--global`). That runs the package’s own scripts, not the project you are standing in.
- You are not inside a project (no `package.json` above you).
- You set `FORKGUARD_SKIP=1`.

### It follows the folder you point npm at

`npm --prefix ./app install`, `pnpm -C ./app install`, `--dir` and `--cwd` are understood, so the project that will actually run is the one that gets checked.

## Fail open

The hook can never break your tools. Only an explicit “infected” answer (exit code 1) stops a command:

- If `forkguard` is missing, for example after switching Node versions with nvm or after uninstalling it, your command simply runs.
- If forkguard itself crashes (exit code 2), your command still runs.

The hook is a function in your shell profile, so you can read exactly what it does.

## Options

- `--remove`: Takes the block back out of every shell profile. Open a new terminal and it is gone. Works even if forkguard is run from `npx`.

## Skipping once

PowerShell:

```powershell
$env:FORKGUARD_SKIP='1'; npm install
```

Git Bash, macOS or Linux:

```bash
FORKGUARD_SKIP=1 npm install
```

## Examples

```bash
npm install -g forkguard
forkguard setup
```

```bash
forkguard setup --remove
```

## See also

- [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/): the guide
- [Environment variables](https://forkguard.pages.dev/reference/environment/)

## Where to next

- [Automatic protection, in full](https://forkguard.pages.dev/guides/automatic-protection/): Every command it checks, and how it fails open.
- [GitHub Action](https://forkguard.pages.dev/guides/github-action/): Protect GitHub too.
- [Troubleshooting](https://forkguard.pages.dev/guides/troubleshooting/): If a hook does not run.
