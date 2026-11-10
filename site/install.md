# Install

> One global install gives you the forkguard command in every folder.

## Requirements

- **Node.js 18 or newer.** Get it from [nodejs.org](https://nodejs.org).
- **git.** Get it from [git-scm.com](https://git-scm.com).

Check you have both:

```bash
node --version
git --version
```

Two features need a little more. `forkguard pr` and `forkguard --mine` talk to GitHub, so they need the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`) or a `GITHUB_TOKEN` environment variable.

## Install

```bash
npm install -g forkguard
```

The `-g` means global: you can now type `forkguard` in any folder. Check it worked:

```bash
forkguard --version
```

> **Tip:** “forkguard is not recognized” or “command not found” right after installing? Close the terminal and open a new one.

## Or try it once

Put `npx` in front of any command. Nothing is installed:

```bash
npx forkguard
npx forkguard someone/their-repo
```

You do need the global install for [automatic protection](https://forkguard.pages.dev/guides/automatic-protection/), because your shell has to be able to find `forkguard`.

## Update

```bash
npm update -g forkguard
```

Check what you have with `forkguard --version`. The newest version is on [npm](https://www.npmjs.com/package/forkguard), and every release is listed on the [releases page](https://github.com/PRODHOSH/forkguard/releases).

## Remove

If you turned on automatic protection, turn it off first so the hook comes out of your shell profile:

```bash
forkguard setup --remove
npm uninstall -g forkguard
```

Open a new terminal afterwards.

## Platform notes

| Platform | Notes |
| --- | --- |
| Windows | Works in PowerShell, PowerShell 7 and Git Bash. `forkguard setup` writes the hook to each profile it finds. |
| macOS | Works in zsh and bash. `forkguard setup` writes to `~/.zshrc` and `~/.bashrc`. |
| Linux | Works in bash and zsh, same files as macOS. |

Tested in CI on Linux, Windows and macOS, on Node 18, 20 and 22.

## Where to next

- [Run your first check](https://forkguard.pages.dev/quick-start/): Check a project, read the result, clean it.
- [Turn on automatic protection](https://forkguard.pages.dev/commands/setup/): Check before every npm install.
- [Check a repo before you clone it](https://forkguard.pages.dev/guides/before-you-clone/): Coding tests and unknown repos.
