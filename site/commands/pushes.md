# forkguard pushes

> Who force-pushed to your repos, and when.

## Name

`forkguard pushes` shows the force-pushes and deleted branches on your repos from the last few days, and flags a script going through many repos at once.

## Synopsis

```bash
forkguard pushes
forkguard pushes --days 7
forkguard pushes owner/repo another/repo
forkguard pushes --json
```

- `--days N`: How far back to look, 1 to 30. The default is 3.
- `owner/repo`: Only these repos. By default, every repo you own.
- `--json`: Print the events as JSON.

## Description

This malware spreads by taking your newest commit, adding its payload and force-pushing the result back with your name, your time and your message. It looks like your own work. GitHub does record every force-push, with the account that made it, and this command reads that record.

Each line shows when, which repo and branch, the commit before and after, and the account. If force-pushes hit three or more repos within ten minutes of each other, that is called a **wave**: a script, not a person. The account shown is the one whose login was used, so a wave you did not make means a token or session of yours is somewhere else.

It needs a GitHub login (`gh auth login`). It only reads.

## Examples

```bash
forkguard pushes --days 2
```

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## See also

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): the account checklist
- [forkguard host](https://forkguard.pages.dev/commands/host/): check each computer

## Where to next

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): The account checklist.
- [forkguard host](https://forkguard.pages.dev/commands/host/): Check each computer.
- [forkguard --mine](https://forkguard.pages.dev/commands/mine/): Check all your repos.
