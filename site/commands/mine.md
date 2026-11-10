# forkguard --mine

> Check every repo you own on GitHub, every branch.

## Name

`forkguard --mine` checks every repository you own on GitHub, every branch, using the same safe method as [`forkguard owner/repo`](https://forkguard.pages.dev/commands/check-repo/).

## Synopsis

```bash
forkguard --mine
forkguard --mine --json
```

## Description

This is the fastest way to know whether your whole GitHub is clean. Run it once now, and again whenever you hear about a new attack. It lists your repos, then checks four at a time. About 50 repos takes a minute or two.

It checks repos you **own**, including forks and archived repos. Repos in organizations where you are only a member or collaborator are not included.

### You need to be logged in

Either log in with the GitHub CLI:

```bash
gh auth login
```

or set a `GITHUB_TOKEN` (or `GH_TOKEN`) environment variable with a personal access token. Without either you get: “Log in first so forkguard can list your repos”.

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

- `--json`: Print a list of repo results, one per repo, instead of text. See [JSON output](https://forkguard.pages.dev/reference/json/).

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run, for example when you are not logged in. |

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
