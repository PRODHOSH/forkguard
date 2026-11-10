# Cleaning an infected project

> Found something? Do this next. The order matters.

1. **Stop.** Do not run `npm install` or `npm run dev`, and do not open the folder in VS Code.
2. **Clean it** with [`forkguard fix`](https://forkguard.pages.dev/commands/fix/), or [`forkguard pr`](https://forkguard.pages.dev/commands/pr/) to clean GitHub as well.
3. **From another device,** change your passwords and keys: GitHub tokens, SSH keys, your npm token, cloud keys, and everything in your `.env` files. The malware steals these, so assume they are known.
4. **Stop history rewrites.** In your GitHub repo go to Settings, then Rules, then Rulesets, and block force pushes on your main branch.
5. **If forkguard says npm itself is infected,** reinstall Node.js from nodejs.org before running npm again.
6. **Check everything else:** run [`forkguard --mine`](https://forkguard.pages.dev/commands/mine/) to check all your repos.
7. **Run a full antivirus scan,** and tell anyone else who works on the same repos.

## fix or pr?

| The malware is… | Use |
| --- | --- |
| Only in a copy on your computer | `forkguard fix` |
| In a repo on GitHub (usually the case) | `forkguard pr` |
| In a repo you forked from someone else | `forkguard pr --upstream` |
| In a repo that is not on GitHub | `forkguard fix`, then commit and push yourself |

Remember the malware gets into GitHub, not your laptop. Run `git pull` before you check your own repos, so the copy you check is the one GitHub has.

## Why you rotate secrets from another device

This malware steals tokens, keys and saved passwords, then uses your GitHub token to rewrite commits in every repo you can push to. If you change credentials on the infected machine, the malware may see the new ones too.

## Why it can come back

- **Another repo is still infected.** The malware spreads through repos you can push to. Check them all with `forkguard --mine`.
- **npm is infected.** An infected npm restarts the malware on every npm command. forkguard checks for this.
- **A bad package is still in your dependencies.** Look for `bad-package` findings, and remove the package.
- **A newer variant.** At least one repo was reinfected with the April 2026 variant after a cleanup of the original. Update forkguard and run it again.

> **Tip:** Add the [GitHub Action](https://forkguard.pages.dev/guides/github-action/) with a nightly schedule, so a reinfection turns your build red within a day.

## Where to next

- [forkguard pr](https://forkguard.pages.dev/commands/pr/): Fix GitHub, not just your laptop.
- [Check all your repos](https://forkguard.pages.dev/commands/mine/): forkguard --mine
- [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/): Stop it happening again.
