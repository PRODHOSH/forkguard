# Automatic protection

> Protect yourself every day without thinking about it.

[`forkguard setup`](https://forkguard.pages.dev/commands/setup/) adds a small, clearly marked block to your shell profile. It wraps `npm`, `pnpm`, `yarn`, `bun` and `git`. For package managers it checks **before** the command runs, and can stop it. For git it checks **after**, and warns you.

1. You type `npm install`.
2. Your shell runs forkguard first.
3. Clean, or only MED: the command runs. HIGH: it is stopped, with the reason.

## Turn it on

```bash
npm install -g forkguard
forkguard setup
```

Press Enter to also stop VS Code from running tasks by itself. Then **close your terminal and open a new one**.

## Which commands are checked

| Tool | Subcommands that trigger a check |
| --- | --- |
| `npm` | `install`, `i`, `ci`, `add`, `run`, `run-script`, `dev`, `start`, `build`, `test`, `exec`, `x`, `rebuild` |
| `pnpm` | `install`, `i`, `add`, `run`, `dev`, `start`, `build`, `test`, `exec`, `dlx` |
| `yarn` | plain `yarn`, `install`, `add`, `run`, `dev`, `start`, `build`, `test`, `dlx` |
| `bun` | `install`, `i`, `add`, `run`, `dev`, `start`, `build`, `test`, `x` |
| `git` | `clone`, `pull`, `merge`, `checkout`, `switch` (checked afterwards; warns, never stops) |

Anything else, such as `npm --version`, `npm publish` or `git status`, runs normally with no check. `npx` is not wrapped.

## What you see

| Project state | What happens |
| --- | --- |
| Clean | Nothing. No output at all. |
| Only MED findings | A one-line note: “forkguard: N thing(s) worth a look in my-app. Run "forkguard" for details.” The command runs. |
| Something HIGH | The findings are printed and the command is stopped: “Stopped "npm install" so nothing in this project runs.” |
| After `git clone` or `pull`, something HIGH | The findings are printed with “The code you just pulled in is infected. Clean it before you open or install it.” The git command had already finished. |

## When the check is skipped

- **Global installs** (`-g`, `--global`, `--location=global`). They run that package’s own scripts, not the project you happen to be in.
- **Outside a project.** There is no `package.json` above you, so there is nothing to protect.
- **`FORKGUARD_SKIP=1`.** Your explicit choice, for one command.

## It checks the project you mean

Options that take a value are understood, so they are not mistaken for the subcommand, and options that choose the project are followed:

```bash
npm --prefix ./app install      # checks ./app
pnpm -C ./app install            # checks ./app
yarn --cwd ./app install         # checks ./app
```

## It fails open

The hook never breaks your tools. Only an explicit “infected” answer (exit code 1) stops a command. If `forkguard` is missing (you switched Node version with nvm, or uninstalled it) or crashes, your command runs anyway.

## Run something anyway, once

```bash
FORKGUARD_SKIP=1 npm install
```

```powershell
$env:FORKGUARD_SKIP='1'; npm install
```

## Turn it off

```bash
forkguard setup --remove
```

Open a new terminal and it is gone. The hook is plain shell code between `# >>> forkguard >>>` and `# <<< forkguard <<<` in your profile, so you can read it or delete it by hand.

> **Note:** The check walks the project each time, so on a very large repo you may notice it after `git checkout`. A typical project takes well under a second.

## Where to next

- [forkguard setup](https://forkguard.pages.dev/commands/setup/): The command in full.
- [GitHub Action](https://forkguard.pages.dev/guides/github-action/): Protect every push.
- [Troubleshooting](https://forkguard.pages.dev/guides/troubleshooting/): If something does not run.
