# After an infection

If a project with this malware was ever installed, run or opened on a machine, assume that machine's secrets were read.

1. **Stop** running the project. Do not open it in an editor that runs tasks.
   Then run `npx forkguard host` to check the computer, and `npx forkguard pushes` to see force-pushes on GitHub. If force-pushes keep arriving, the user's token is in use somewhere else: they must revoke it from a clean device first (sessions, authorized OAuth apps and GitHub Apps, the tokens you created, SSH keys, recovery codes and password at github.com/settings), or any cleanup is pushed back over.
2. **Clean the repo.** `npx forkguard fix` on the local copy, or `npx forkguard pr` to fix it on a branch and open a pull request. Review with `git diff`.
3. **Change the secrets** that were on that machine, from a different, clean machine if you can: GitHub tokens and SSH keys, npm tokens, cloud keys (AWS, GCP, Azure), Vercel and Cloudflare tokens, `.env` values, and any API keys in shell history.
4. **Turn on branch protection** for the default branch: no force pushes, pull requests required. This malware rewrites commits.
5. **Check everything else.** `npx forkguard` in the folder that holds all your projects, and `npx forkguard --mine` for GitHub.
6. **Run an antivirus scan** on the machine.
7. **Turn on automatic protection**: `npm install -g forkguard`, then `forkguard setup`.

Never paste a token into a chat. Do it in your own terminal.
