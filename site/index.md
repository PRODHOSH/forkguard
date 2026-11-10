# Documentation

> Catch malware hidden in a repo before you install or run it. Check a folder, a GitHub link or every repo you own, then clean what it finds and open a pull request.

```bash
npx forkguard
```

No install needed: `npx` runs it once. You need [Node.js](https://nodejs.org) 18 or newer and git. If it prints a list, something is wrong. If it prints one green line, you are fine.

## Start here

New to forkguard? Follow these four steps in order. Each one is a few minutes.

1. [Install it](https://forkguard.pages.dev/install/): One command. Needs Node.js 18+ and git.
2. [Check a project](https://forkguard.pages.dev/quick-start/): Your first check, and how to read the result.
3. [Clean it](https://forkguard.pages.dev/commands/fix/): Remove what it found and get your original files back.
4. [Stay protected](https://forkguard.pages.dev/guides/automatic-protection/): Check automatically before every npm install, for good.

## I want to…

Already know what you need? Jump straight to it.

- [Check a repo before I clone it](https://forkguard.pages.dev/guides/before-you-clone/): Coding tests, recruiter repos, anything unknown.
- [Check all my repos on GitHub](https://forkguard.pages.dev/commands/mine/): One command, every branch.
- [Clean an infected project](https://forkguard.pages.dev/guides/cleaning/): What to do, in order.
- [Fix it on GitHub](https://forkguard.pages.dev/commands/pr/): Open a pull request with the fix.
- [Check every push](https://forkguard.pages.dev/guides/github-action/): Add the GitHub Action.
- [Protect my AI agent](https://forkguard.pages.dev/guides/ai-agents/): Rules for Claude Code, Cursor, Copilot, Codex.
- [Understand a message](https://forkguard.pages.dev/guides/read-results/): What each line of the output means.
- [See every rule](https://forkguard.pages.dev/reference/rules/): Everything forkguard looks for.
- [Use it in a script](https://forkguard.pages.dev/reference/json/): JSON output and exit codes.
- [Fix a problem](https://forkguard.pages.dev/guides/troubleshooting/): Troubleshooting and FAQ.

## Every command

| Command | What it does | Changes anything? |
| --- | --- | --- |
| [`forkguard`](https://forkguard.pages.dev/commands/check/) | Checks the current folder, or another one | No |
| [`forkguard owner/repo`](https://forkguard.pages.dev/commands/check-repo/) | Checks a GitHub repo, every branch, without downloading its files | No |
| [`forkguard --mine`](https://forkguard.pages.dev/commands/mine/) | Checks every repo you own on GitHub | No |
| [`forkguard fix`](https://forkguard.pages.dev/commands/fix/) | Removes what it found, on your computer | Yes, your files |
| [`forkguard pr`](https://forkguard.pages.dev/commands/pr/) | Removes it on a new branch and opens a pull request | Yes, a branch and a pull request |
| [`forkguard setup`](https://forkguard.pages.dev/commands/setup/) | Checks automatically before npm install and after git clone | Yes, your shell profile |
| [`forkguard agent`](https://forkguard.pages.dev/commands/agent/) | Safety rules for AI coding agents (next release) | Only with `--write` |

Only `fix`, `pr`, `setup` and `agent --write` ever change anything. Checking is always read only.

## What forkguard does

Some malware hides inside ordinary looking repositories. The code sits after hundreds of blank spaces at the end of a normal line, so your editor shows nothing. It rewrites your latest commit, keeping the author, date and message, so git shows nothing either. The moment you open the folder in VS Code, or run `npm install` or `npm run dev`, it runs, steals tokens and keys, and spreads to every repo you can push to.

forkguard looks for every trick this malware uses, **before** anything runs. It never runs code from the project it checks, and it never uploads your code anywhere.

- **Zero dependencies.** A tool you run before `npm install` should not need `npm install`.
- **Cross platform.** Windows, macOS and Linux, with PowerShell, Git Bash, bash and zsh.
- **Private.** No account and no telemetry. The only network calls are downloading a repo you asked it to check, and talking to GitHub for `forkguard pr` and `--mine`.
- **Free and open source.** MIT licensed. [Source on GitHub](https://github.com/PRODHOSH/forkguard).

## How these pages work

Each command page is laid out like a manual page, with the sections Name, Synopsis, Description and so on. Every section is written twice:

| Switch | You see |
| --- | --- |
| **Off** (the default) | Plain words, with examples and sample output. Start here. |
| **On**, “Less comfortable” | The short reference text you would find in a real manual page. |

Flip the switch on a section to change just that section, or use the switch in the header to change the whole page. Your choice is remembered.

> **Note:** Search is on every page. Press `/` or `Ctrl K` (`⌘ K` on a Mac).
