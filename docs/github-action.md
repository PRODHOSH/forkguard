<p align="center">
  <a href="https://github.com/PRODHOSH/forkguard">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../site/assets/brand/logo-on-dark.svg">
      <img src="../site/assets/brand/logo.svg" alt="forkguard" height="56">
    </picture>
  </a>
</p>

# Using forkguard in GitHub Actions

Let GitHub check your repo on every push and pull request, so you find out the moment something bad lands, even if you are not at your computer.

## Contents

1. [Why use it](#1-why-use-it)
2. [Set it up in two minutes](#2-set-it-up-in-two-minutes)
3. [Inputs](#3-inputs)
4. [What happens when it finds something](#4-what-happens-when-it-finds-something)
5. [Opening the fix as a pull request](#5-opening-the-fix-as-a-pull-request)
6. [Examples](#6-examples)
7. [Pinning a version](#7-pinning-a-version)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Why use it

This malware spreads by rewriting the latest commit in repos it can reach, often while you are not even looking at them. The forkguard Action checks every push, so:

- You find out right away, because the build turns red and GitHub emails you.
- Infected code cannot sneak into your main branch through a pull request.
- It can open a pull request with the fix for you.

---

## 2. Set it up in two minutes

1. In your repo, create the file `.github/workflows/forkguard.yml`.
2. Paste this in:

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
         - uses: PRODHOSH/forkguard@v0.3.1
   ```

3. Commit and push it.

That is it. Open the **Actions** tab of your repo to see it run.

---

## 3. Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `path` | `.` | Which folder to check. Useful for monorepos. |
| `open-pr` | `false` | When something is found, also open a pull request that removes it |

---

## 4. What happens when it finds something

- The step prints exactly what it found, the same as the CLI.
- The workflow **fails**, so the commit gets a red cross.
- GitHub sends you the usual failed workflow email.
- On a pull request, the failing check shows right on the pull request, so nobody merges it by accident.

MED findings are printed but do not fail the build. Only HIGH findings do.

---

## 5. Opening the fix as a pull request

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
      - uses: PRODHOSH/forkguard@v0.3.1
        with:
          open-pr: true
```

When something is found, the Action creates a branch called `forkguard/remove-malware`, commits the fix, and opens a pull request on your repo. Review it and merge it.

> The pull request is opened by GitHub Actions. Some repos block Actions from creating pull requests. If that happens, go to **Settings**, then **Actions**, then **General**, and allow GitHub Actions to create pull requests.

---

## 6. Examples

**Check only one folder in a monorepo:**

```yaml
      - uses: PRODHOSH/forkguard@v0.3.1
        with:
          path: apps/web
```

**Check every night, not just on push.** Useful for repos you rarely touch, which is exactly where this malware hides:

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
      - uses: PRODHOSH/forkguard@v0.3.1
```

**Use the CLI directly in your own workflow:**

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx forkguard
```

---

## 7. Pinning a version

`PRODHOSH/forkguard@v0.3.1` always runs that exact version, so nothing changes under you. When a new version comes out, update the number. All versions are listed on the [releases page](https://github.com/PRODHOSH/forkguard/releases).

---

## 8. Troubleshooting

**The build fails but I do not see why**
Open the failed run in the **Actions** tab and expand the forkguard step. The findings are listed there, the same as in your terminal.

**It failed with permission errors when opening a pull request**
Make sure the workflow has `contents: write` and `pull-requests: write`, and that Actions are allowed to create pull requests in your repo settings.

**It flagged something that is fine**
[Report a false alarm](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml) with the file and the message.
