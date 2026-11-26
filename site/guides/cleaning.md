# Cleaning an infected project

> Found something? Do this next. The order matters.

1. **Stop.** Do not run `npm install` or `npm run dev`, and do not open the folder in VS Code.
2. **Check the computer** with [`forkguard host`](https://forkguard.pages.dev/commands/host/). It looks for the hidden loader, running processes, startup items and shell history, and it never changes anything.
3. **Cut off access first,** from another device: see the checklist below. Cleaning repos while a stolen token still works only gets the malware pushed straight back.
4. **Clean it** with [`forkguard fix`](https://forkguard.pages.dev/commands/fix/), or [`forkguard pr`](https://forkguard.pages.dev/commands/pr/) to clean GitHub as well.
5. **Rotate your keys.** GitHub tokens, SSH keys, your npm token, cloud keys, and everything in your `.env` files. The malware steals these, so assume they are known.
6. **Stop history rewrites.** In your GitHub repo go to Settings, then Rules, then Rulesets, and block force pushes on your main branch.
7. **If forkguard says npm itself is infected,** reinstall Node.js from nodejs.org before running npm again.
8. **Check everything else:** run [`forkguard --mine`](https://forkguard.pages.dev/commands/mine/) to check all your repos, and [`forkguard pushes`](https://forkguard.pages.dev/commands/pushes/) an hour later to see whether anything was force-pushed back.
9. **Run a full antivirus scan,** and tell anyone else who works on the same repos to run forkguard and to re-clone instead of pulling.

## Cut off access: the GitHub checklist

Do these in order, from a clean device. Each one closes a different way back in.

1. Sign out of every session: github.com/settings/sessions.
2. Revoke every authorized OAuth app, especially GitHub CLI and VS Code, and every authorized GitHub App: github.com/settings/applications.
3. Delete every personal access token, classic and fine-grained: github.com/settings/tokens.
4. Remove SSH keys you do not recognise: github.com/settings/keys.
5. Check installed GitHub Apps and, in each repo, the deploy keys, webhooks and Actions secrets: github.com/settings/installations.
6. Regenerate your 2FA recovery codes, remove passkeys you do not know, then change your password: github.com/settings/security.
7. Do the same in each organization you belong to.
8. Log in again with `gh auth login`, and delete the old `github.com` entry in your system keychain.
9. Rotate npm tokens (npmjs.com/settings), cloud keys and database keys, and update them wherever they are used.

> **Tip:** A force-push you did not make is the clearest sign someone is using your login. [`forkguard pushes`](https://forkguard.pages.dev/commands/pushes/) lists them, and flags a script going through many repos within minutes.

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
- **A token you did not revoke.** The malware keeps working from anywhere your old token is valid. If force-pushes continue after a cleanup, revoke again and look at [`forkguard pushes`](https://forkguard.pages.dev/commands/pushes/).
- **Another computer.** A second laptop with an infected copy of the repos can push the payload back. Run [`forkguard host`](https://forkguard.pages.dev/commands/host/) on every computer you use.

> **Tip:** Add the [GitHub Action](https://forkguard.pages.dev/guides/github-action/) with a nightly schedule, so a reinfection turns your build red within a day.

## Where to next

- [forkguard pr](https://forkguard.pages.dev/commands/pr/): Fix GitHub, not just your laptop.
- [Check all your repos](https://forkguard.pages.dev/commands/mine/): forkguard --mine
- [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/): Stop it happening again.
