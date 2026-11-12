# GitHub Action

> Let GitHub check your repo on every push, even when you are not at your computer.

## Why use it

This malware spreads by rewriting the latest commit in repos it can reach, often while you are not looking at them. The Action checks every push, so you find out right away (the build turns red and GitHub emails you), infected code cannot sneak into your main branch through a pull request, and it can open a pull request with the fix for you.

## Set it up in two minutes

1. In your repo, create the file `.github/workflows/forkguard.yml`.
2. Paste this in.
3. Commit and push it.

```yaml
name: forkguard
on: [push, pull_request]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PRODHOSH/forkguard@v0.4.1
```

Open the **Actions** tab of your repo to see it run.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `path` | `.` | Which folder to check. Useful for monorepos. |
| `open-pr` | `false` | When something is found, also open a pull request that removes it. |

## What happens when it finds something

- The step prints exactly what it found, the same as the CLI.
- The workflow **fails**, so the commit gets a red cross, and GitHub sends the usual failed workflow email.
- On a pull request, the failing check shows right there, so nobody merges it by accident.

MED findings are printed but do not fail the build. Only HIGH findings do.

## Open the fix as a pull request

Set `open-pr: true` and give the workflow permission to write:

```yaml
name: forkguard
on: [push]

permissions:
  contents: write
  pull-requests: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PRODHOSH/forkguard@v0.4.1
        with:
          open-pr: true
```

When something is found, the Action creates a branch called `forkguard/remove-malware`, commits the fix and opens a pull request on your repo. Review it and merge it.

> **Note:** Use the `push` event for `open-pr`. A `pull_request` run checks out a detached commit, and forkguard needs to be on a branch to create the fix branch. Some repos also block Actions from creating pull requests: allow it under Settings, Actions, General.

## More examples

### Check one folder of a monorepo

```yaml
      - uses: PRODHOSH/forkguard@v0.4.1
        with:
          path: apps/web
```

### Check every night, not just on push

Useful for repos you rarely touch, which is exactly where this malware hides:

```yaml
name: forkguard
on:
  push:
  pull_request:
  schedule:
    - cron: "0 3 * * *"

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PRODHOSH/forkguard@v0.4.1
```

### Use the CLI directly

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx forkguard
```

## Pin a version

`PRODHOSH/forkguard@v0.4.1` always runs that exact version, so nothing changes under you. When a new version comes out, update the number. All versions are on the [releases page](https://github.com/PRODHOSH/forkguard/releases).

## Troubleshooting

- The build fails but I do not see why: Open the failed run in the Actions tab and expand the forkguard step. The findings are listed there, the same as in your terminal.
- Permission errors when opening a pull request: Make sure the workflow has `contents: write` and `pull-requests: write`, and that Actions are allowed to create pull requests in your repo settings.
- It flagged something that is fine: [Report a false alarm](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml) with the file and the message.

## Where to next

- [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/): Protect your own computer too.
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): When the build turns red.
- [forkguard pr](https://forkguard.pages.dev/commands/pr/): The same fix, from the terminal.
