# Troubleshooting and FAQ

> Common problems, and common questions.

## Problems

- “forkguard is not recognized” or “command not found”: Install it globally with `npm install -g forkguard`, then open a new terminal.
- Automatic checks do not run after setup: Close the terminal and open a new one. Setup only takes effect in new terminals.
- npm stopped working after I switched Node versions: Update forkguard: the hook now fails open, so a missing forkguard no longer blocks npm. To unblock a current shell, run `command npm install`, or `forkguard setup --remove` from a Node version that has it.
- “Log in first so forkguard can list your repos”: Run `gh auth login`, or set a `GITHUB_TOKEN`. Needed for `--mine`.
- “could not download” when checking a link: Check the link is right. For a private repo, make sure you are logged in with `gh auth login`.
- “You have uncommitted changes”: `forkguard pr` needs a clean working tree. Run `git stash`, try again, then `git stash pop`.
- “The origin remote is not on GitHub”: `forkguard pr` only works with repos on GitHub. Use `forkguard fix` instead.
- “No such folder”: The path does not exist. forkguard treats `owner/repo` as a GitHub repo only when no folder has that name.
- `forkguard pr` did not open the pull request: It still pushed the branch and printed a link. Open the link. To let it open the PR itself, log in with `gh auth login` or set `GITHUB_TOKEN`.
- A “still needs a look” finding after `fix`: That finding has no automatic fix. Read it in [What it catches](https://forkguard.pages.dev/reference/rules/) and decide.

## Questions

### Does it upload my code?

No. Everything happens on your machine. It only talks to GitHub when you ask it to check a link, check your repos, or open a pull request.

### Will it slow down npm?

A typical project is checked in well under a second. Commands like `npm --version` are not checked at all.

### Can it check private repos?

Yes, as long as git on your machine can access them. Logging in with `gh auth login` is the easiest way.

### What if it flags something that is fine?

Skip it once with `FORKGUARD_SKIP=1`, and [report a false alarm](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml) so the rule gets better.

### Does it replace antivirus?

No. It is built to catch this family of attacks very well, before code runs. Keep your antivirus too.

### Does it work on GitLab or Bitbucket?

Checking works with any git URL. `forkguard pr` opens pull requests on GitHub only.

### Does it have any dependencies?

None. A tool you run before `npm install` should not need `npm install`.

### It missed something

[Tell us what it looked like](https://github.com/PRODHOSH/forkguard/issues/new?template=missed-malware.yml). Describe it rather than pasting the malicious code.

## Where to next

- [Reading the results](https://forkguard.pages.dev/guides/read-results/): What a message means.
- [Every rule](https://forkguard.pages.dev/reference/rules/): False alarm or miss?
- [About](https://forkguard.pages.dev/about/): Report a problem.
