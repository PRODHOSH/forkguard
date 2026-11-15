# forkguard --mine

> Check every repo you own on GitHub, every branch.

## Name

`forkguard --mine` checks your GitHub repositories, every branch, using the same safe method as [`forkguard owner/repo`](https://forkguard.pages.dev/commands/check-repo/). With `--fix` it also opens a pull request for each infected repo.

## Synopsis

```bash
forkguard --mine
forkguard --mine --fix
forkguard --mine --json
```

## Description

This is the fastest way to know whether your whole GitHub is clean. Run it once now, and again whenever you hear about a new attack. Checking about 50 repos takes a few minutes.

It checks repos you **own**, including forks and archived repos. Repos in organizations where you are only a member or collaborator are not included.

### You do not need to log in to look

If you are not logged in, forkguard finds your GitHub name from settings already on your computer (your git settings and the links of the repos you have cloned), asks you to confirm it, and checks all your **public** repos. It never reads a saved password or token.

If you are logged in, it checks everything you own, private repos too. Log in either way:

```bash
gh auth login
```

or set a `GITHUB_TOKEN` (or `GH_TOKEN`) environment variable with a personal access token. When you are not logged in, forkguard prints these steps for your computer (macOS, Windows or Linux) whenever a login would help.

### Fixing: one pull request per repo

```bash
forkguard --mine --fix
```

For each repo that is infected on its **default branch**, forkguard downloads it to a temporary folder, cleans it on a new branch, and opens a pull request with a short plain description. It **never** pushes to your main branch and never force pushes, so nothing changes until you merge. It asks once before it starts, a repo that already has a forkguard pull request is skipped, and infected side branches are only listed.

Opening a pull request means writing to your repo, so this needs a login. With a token, give it **Contents: Read and write** and **Pull requests: Read and write** on the repos you want fixed.

## Output

```text
forkguard  checking 54 of your repos on GitHub, every branch

  clean            you/portfolio
  INFECTED         you/old-project
  worth a look     you/side-project
  clean            you/vector
  ...

  54 repos checked: 52 clean, 1 infected
```

Then you get the full details for every repo that is not clean.

| Status | Meaning |
| --- | --- |
| `clean` | Nothing found on any branch. |
| `INFECTED` | Something HIGH on at least one branch. |
| `worth a look` | Only MED findings. |
| `could not check` | The download failed, usually because of access. |

## Options

- `--fix`: Open a pull request for each repo that is infected on its default branch. Needs a login.
- `--yes`, `-y`: Do not ask before opening the pull requests. For scripts.
- `--json`: Print a list of repo results, one per repo, instead of text. See [JSON output](https://forkguard.pages.dev/reference/json/).

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run, for example when `--fix` is used without a login. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## Examples

```bash
forkguard --mine
```

Only list the repos that are infected, using `jq`:

```bash
forkguard --mine --json | jq -r '.[] | select(.branches // [] | any(.findings[]?; .level == "high")) | .name'
```

## See also

- [`forkguard pr`](https://forkguard.pages.dev/commands/pr/): fix an infected repo
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/)

## Where to next

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): What to do, in order.
- [Fix it on GitHub](https://forkguard.pages.dev/commands/pr/): forkguard pr
- [Check every push](https://forkguard.pages.dev/guides/github-action/): The GitHub Action.
