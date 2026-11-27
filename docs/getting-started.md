<p align="center">
  <a href="https://github.com/PRODHOSH/forkguard">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../site/assets/brand/logo-on-dark.svg">
      <img src="../site/assets/brand/logo.svg" alt="forkguard" height="56">
    </picture>
  </a>
</p>

> This page is also on the [documentation site](https://forkguard.pages.dev/quick-start/), with search and a short and a plain-words version of every command. All docs: [index](README.md).

# Getting started with forkguard

This guide takes you from zero to fully protected, one step at a time. No security background needed. Read it top to bottom the first time, then jump back to any section when you need it.

```mermaid
flowchart LR
    A["Install"] --> B["Check<br/>folder, link, all repos"]
    B --> C["Clean<br/>fix and pull request"]
    C --> D["Check AI skills<br/>and teach your agent"]
    D --> E["Protect<br/>setup and GitHub Action"]
```

## Contents

1. [What forkguard does](#1-what-forkguard-does)
2. [Install it](#2-install-it)
3. [Check a project on your computer](#3-check-a-project-on-your-computer)
4. [Check a GitHub repo before you clone it](#4-check-a-github-repo-before-you-clone-it)
5. [Check every repo you own](#5-check-every-repo-you-own)
6. [Read the results](#6-read-the-results)
7. [Clean a project](#7-clean-a-project)
8. [Fix it on GitHub with a pull request](#8-fix-it-on-github-with-a-pull-request)
9. [Check an AI agent skill](#9-check-an-ai-agent-skill)
10. [Add an AI review (optional)](#10-add-an-ai-review-optional)
11. [Teach your AI agent](#11-teach-your-ai-agent)
12. [Turn on automatic protection](#12-turn-on-automatic-protection)
13. [Add it to GitHub Actions](#13-add-it-to-github-actions)
14. [Found something? Do this next](#14-found-something-do-this-next)
15. [Troubleshooting](#15-troubleshooting)
16. [Cheat sheet](#16-cheat-sheet)

---

## 1. What forkguard does

Some malware hides inside ordinary looking repos. Three things make it dangerous:

- **It is invisible.** The code sits after hundreds of spaces at the end of a normal line, so your editor shows nothing unless you scroll far to the right.
- **It runs on its own.** It starts the moment you open the folder in VS Code, or type `npm install` or `npm run dev`.
- **It spreads.** It steals your GitHub token and uses it to quietly rewrite commits in every repo you can push to.

forkguard looks for every trick this malware uses, **before** anything runs. If it finds something, it can clean it up, both on your computer and on GitHub. It also checks **AI agent skills** (the instruction folders Claude Code, Codex and Cursor load) before you install them.

It never runs code from the project it checks, and it never uploads your code anywhere.

---

## 2. Install it

You need two things on your computer:

- **Node.js 18 or newer.** Get it from [nodejs.org](https://nodejs.org).
- **git.** Get it from [git-scm.com](https://git-scm.com).

Check you have them:

```bash
node --version
```

```bash
git --version
```

Now install forkguard:

```bash
npm install -g forkguard
```

The `-g` means "global": you can now type `forkguard` in any folder. Check it worked:

```bash
forkguard --version
```

> **Just want to try it once?** Skip installing and put `npx` in front of any command, like `npx forkguard`. You do need the global install for automatic protection (section 12).

> **"forkguard is not recognized" after installing?** Close your terminal and open a new one.

---

## 3. Check a project on your computer

Open a terminal **inside** the project folder and run:

```bash
forkguard
```

To check a folder without moving into it, give the path:

```bash
forkguard path/to/project
```

**Check everything at once.** Run it in the folder that holds all your projects (for example `~/Developer`). forkguard checks every project inside, however deep, and changes nothing.

A clean project looks like this:

```text
forkguard  my-app looks clean (433 files checked)
```

If you see that, you are good to go. If you see a list instead, jump to [section 6](#6-read-the-results).

> **Tip for your own repos:** run `git pull` first. This malware gets into GitHub, not your laptop, so your local copy can look clean while GitHub has the infected version.

---

## 4. Check a GitHub repo before you clone it

This is the safest way to look at a repo you do not know yet, like a coding test from a recruiter or a project you want to fork. You do not even need to clone it.

```bash
forkguard someone/their-repo
```

A full link works too:

```bash
forkguard https://github.com/someone/their-repo
```

What happens:

1. forkguard downloads the latest commit of **every branch** into a temporary folder.
2. It does **not** unpack the files. They stay packed inside git, so nothing from the repo lands on your disk as a real file.
3. It checks everything, then deletes the temporary folder.

Result:

```text
forkguard  someone/their-repo looks clean (3 branches checked)
```

Only clone and open it if it says **looks clean**. If it shows anything HIGH, do not clone it, do not open it and do not run it.

> Works for private repos too, as long as you are logged in to GitHub on this computer. The easiest way is `gh auth login`.

---

## 5. Check every repo you own

One command checks all of your GitHub repos, every branch:

```bash
forkguard --mine
```

**You do not need to log in to look.** Not logged in, forkguard finds your GitHub name from settings already on your computer, asks you to confirm it and checks your **public** repos. It then shows how to log in for the private ones. Logged in, it checks everything you own.

To log in once, install the [GitHub CLI](https://cli.github.com) and run:

```bash
gh auth login
```

(No GitHub CLI? Set a `GITHUB_TOKEN` instead. forkguard prints the exact steps for your computer when a login would help.)

You get one line per repo while it works:

```text
forkguard  checking 54 of your repos on GitHub, every branch

  clean            you/portfolio
  INFECTED         you/old-project
  worth a look     you/side-project
  ...

  54 repos checked: 52 clean, 1 infected
```

Then the full details for every repo that needs attention. About 50 repos takes a minute or two.

To check a friend's or a team's public repos, give a name instead. Nothing is downloaded to your disk and nothing changes on their side:

```bash
forkguard @their-name
```

> Do this once now, and again whenever you hear about a new attack. It is the fastest way to know your whole GitHub is clean.

---

## 6. Read the results

When forkguard finds something, you get a list:

```text
forkguard  my-app

  HIGH  init                Code hidden after 776 blank spaces on line 35
  HIGH  package.json        "dev" runs a hidden file called init before your real command
  MED   .gitignore          Hides config.bat, a file this malware drops

  3 problems found. Do not run npm install, npm run dev or open this folder in VS Code yet.
```

Each line has three parts:

1. **The level:** how serious it is.
2. **The file:** where it is.
3. **The message:** what is wrong, in plain words.

| Level | What it means | What to do |
| --- | --- | --- |
| **HIGH** | Dangerous. It can run by itself and steal from you. | Do not install, run or open the project. Clean it first. |
| **MED** | Worth a look. It does not run by itself. | Read it and decide. Most can be fixed with `forkguard fix`. |

Want to know what each message means? The [How it works](how-it-works.md#2-what-it-checks) page lists every check.

---

## 7. Clean a project

Inside the project folder, or in the big folder that holds many projects, run:

```bash
forkguard fix
```

You will see what changed:

```text
forkguard  cleaning my-app

  done  init                deleted
  done  package.json        cleaned
  done  postcss.config.mjs  restored your original from git history

  Clean now. Review with "git diff", then commit.
```

What each word means:

| Word | What happened |
| --- | --- |
| **deleted** | The file was nothing but malware, so it is gone |
| **cleaned** | The file is yours. Only the bad part was removed. Your code is untouched. |
| **restored your original from git history** | forkguard found the clean version you wrote before the attack and put it back exactly |

Run from a folder with many projects, `fix` cleans every infected one, restoring each file from **that project's own** git history. If more than one project is affected it asks once before changing anything (add `--yes` to skip the question), and prints one summary at the end.

Now look at what changed and save it:

```bash
git diff
```

```bash
git add -A
git commit -m "Remove injected malware"
```

> **Not a git repo?** forkguard asks before changing anything, because there is no way to undo it.

> **Some things are not fixed automatically:** a known bad npm package, a risky install script, or an infected npm on your computer. forkguard tells you what to do for each.

---

## 8. Fix it on GitHub with a pull request

`forkguard fix` cleans your computer. A **pull request** cleans **GitHub** too, and that is what you want when the malware is in a repo on GitHub, which it usually is. Nothing changes on GitHub until you merge.

### Before you start

1. **Log in to GitHub.** The easiest way:

   ```bash
   gh auth login
   ```

   No GitHub CLI? A `GITHUB_TOKEN` environment variable works too. Without either, `forkguard pr` still pushes the branch and gives you a link to open the pull request yourself.

2. **Commit or stash any work in progress.** forkguard refuses to run with uncommitted changes, so your work never ends up mixed into the fix:

   ```bash
   git stash
   ```

### Fix your own repo

Inside the project folder:

```bash
forkguard pr
```

Here is everything it does, in order:

```mermaid
flowchart LR
    A["New branch<br/>forkguard/remove-malware"] --> B["Clean it"]
    B --> C["Commit<br/>Remove injected malware"]
    C --> D["Push to GitHub"]
    D --> E["Open the<br/>pull request"]
    E --> F["Switch you back<br/>to your branch"]
```

At the end you get a link. Open it, look at the changes and click **Merge**. Then bring your stashed work back:

```bash
git stash pop
```

### Fix every infected repo at once

Do not want to clone them one by one? After `forkguard --mine` shows what is infected:

```bash
forkguard --mine --fix
```

It opens **one pull request per infected repo**, never pushes to your main branch, skips repos that already have a forkguard pull request, and asks once before it starts. It needs a login with permission to write to your repos (Contents and Pull requests, Read and write).

### Fix the repo you forked from

If you forked someone's project and **their** repo has the malware, send them the fix:

```bash
forkguard pr --upstream
```

forkguard builds the fix on top of the original repo, not your fork. That way the pull request holds only the fix, and never carries anything bad from your fork along with it.

| You want to... | Run |
| --- | --- |
| Clean your own repo on GitHub | `forkguard pr` |
| Fix all your infected repos | `forkguard --mine --fix` |
| Send the fix to the repo you forked from | `forkguard pr --upstream` |

---

## 9. Check an AI agent skill

Claude Code, Codex, Cursor and other AI coding tools load **skills**: folders with a `SKILL.md` and sometimes scripts. Your agent follows them with your permissions, so a bad skill can tell it to ignore its safety rules, read your keys or send your files out. Look before you install, the same way you look at a dependency.

```bash
forkguard skills owner/repo
```

It downloads the source to a temporary folder, reads it (it never runs anything in it), deletes it and shows a verdict:

```text
  owner/repo  looks fine  score 0/100, low risk
```

or, for a dangerous one:

```text
  evil  do not install  score 100/100, critical risk
    HIGH     P1    SKILL.md:6  Instruction Override  "Ignore all previous instructions"
    HIGH     AS1   SKILL.md:7  Agent Config Directory Access  "~/.claude/settings.json"
    ...
```

Other ways to use it:

| You want to check | Run |
| --- | --- |
| Every skill already installed on this computer | `forkguard skills` |
| One skill, or a folder of skills | `forkguard skills ./my-skill` |
| A skill on GitHub, before you install it | `forkguard skills owner/repo` |

With [automatic protection](#12-turn-on-automatic-protection) on, `npx skills add owner/repo` does this check for you and stops the install if the skill is dangerous. Everything about scores, coverage and the NVIDIA SkillSpector rules behind it is in [AI agent skills](skills.md).

---

## 10. Add an AI review (optional)

The check in section 9 matches known patterns, offline. If you want a second opinion, forkguard can also run SkillSpector's **AI stage** with **your own API key**. forkguard has no key and no service of its own: you bring one.

**1. Get a key** from [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com), or run a model on your own computer with [Ollama](https://ollama.com) (no key, and nothing leaves your computer).

**2. Put it in your terminal as an environment variable.** macOS, Linux and Git Bash:

```bash
export ANTHROPIC_API_KEY=your-key
```

Windows PowerShell:

```powershell
$env:ANTHROPIC_API_KEY = "your-key"
```

(OpenAI: `OPENAI_API_KEY`. Local model: `FORKGUARD_AI_BASE_URL=http://localhost:11434/v1` and `FORKGUARD_AI_MODEL=llama3.1`.) It lives only in that terminal window. Do not type a key into the forkguard command itself, because a command is saved in your shell history.

**3. Add `--ai`:**

```bash
forkguard skills owner/repo --ai
```

forkguard tells you what it will send and asks first:

```text
forkguard  AI review

  It will send the text of 3 files from 1 skill to Anthropic (claude-sonnet-5-5): 12 requests, about 18k tokens in.
  Keys, tokens and .env values are hidden first. You pay your provider for the tokens.

  Send it? (y/N)
```

Then each finding is marked "AI confirmed" or "AI did not confirm", and problems the rules cannot see are added ("found by the AI review"). The review can only make forkguard **stricter**: it can add a reason to block a skill, never lift a block, because a skill can try to talk a model into calling it harmless.

> **No key set?** Run the command anyway. forkguard shows these steps for your computer, and in a terminal lets you paste a key (hidden, for that run only). GitHub works the same way: `export GITHUB_TOKEN=...`, or `gh auth login`.

Everything about the review, every variable and what is sent: [AI review](skills.md#ai-review-optional).

---

## 11. Teach your AI agent

Your AI agent will run `npm install` on anything you point it at. Instead of explaining forkguard to it, give it the forkguard **skill**:

```bash
npx skills add PRODHOSH/forkguard
```

That installs the skill into Claude Code, Codex, Cursor and the other agents the [skills CLI](https://github.com/vercel-labs/skills) supports. From then on your agent:

- runs `npx forkguard --json` before it installs, builds or opens anything it did not write;
- stops when the exit code is `1` and tells you what it found;
- never runs `forkguard fix`, `pr` or `FORKGUARD_SKIP` without asking you;
- checks a skill before it installs one.

It also knows every forkguard command, so you can just ask it, "check my repos" or "is this skill safe?".

Prefer just a few lines in `AGENTS.md` or `CLAUDE.md`? `forkguard agent --write` adds the short rules there.

---

## 12. Turn on automatic protection

This is the part that protects you every day without you thinking about it. You need forkguard installed globally (section 2).

Run once:

```bash
forkguard setup
```

It will ask:

```text
Also stop VS Code from running tasks by itself when you open a folder? (Y/n)
```

Press **Enter** for yes. That is the setting this malware uses to start the moment you open a folder.

Then **close your terminal and open a new one**. From now on:

| When you run... | forkguard... |
| --- | --- |
| `npm install`, `npm run dev`, `npm start`, `npm test`, `npm run build` | checks first, and **stops the command** if the project is dangerous |
| the same with `pnpm`, `yarn` or `bun` | does the same |
| `npx skills add owner/repo` (also `bunx`, `pnpx`, `pnpm dlx`, `yarn dlx`, `npm exec`) | checks the skill first, and **stops the install** if it is dangerous |
| `git clone`, `git pull`, `git merge`, `git checkout`, `git switch` | checks what you just pulled in and warns you |
| anything else, like `npm --version` or `git status` | runs normally, no check |

When everything is clean, you see nothing at all. It only speaks up when something is wrong. This is what it looks like when it stops something:

```text
forkguard  my-app

  HIGH  init  Code hidden after 776 blank spaces on line 35

  Stopped "npm install" so nothing in this project runs.
```

### Run something anyway, just once

PowerShell:

```powershell
$env:FORKGUARD_SKIP='1'; npm install
```

Git Bash, macOS or Linux:

```bash
FORKGUARD_SKIP=1 npm install
```

### Turn it off

```bash
forkguard setup --remove
```

Open a new terminal and it is gone.

> Works with PowerShell, Git Bash, bash and zsh. Setup only adds one clearly marked block to your shell profile, and `--remove` takes it out again. If forkguard is ever missing or crashes, your command still runs.

---

## 13. Add it to GitHub Actions

Your computer is protected. Now protect GitHub too, so every push gets checked even when you are not around.

Create `.github/workflows/forkguard.yml` in your repo:

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
      - uses: PRODHOSH/forkguard@v0.9.2
```

Commit and push it. If malware ever lands, the build turns red and GitHub emails you.

The [GitHub Action guide](github-action.md) covers everything else: opening the fix as a pull request, nightly checks, monorepos, and checking skills in CI.

---

## 14. Found something? Do this next

The order matters.

1. **Do not** run `npm install` or `npm run dev`, and do not open the folder in VS Code.
2. **Clean it** with `forkguard fix`, or `forkguard pr` to clean GitHub too.
3. **From another device**, change your passwords and keys: GitHub tokens, SSH keys, your npm token, cloud keys, and everything in your `.env` files. The malware steals these, so assume they are known.
4. **Stop history rewrites.** In your GitHub repo go to **Settings**, then **Rules**, then **Rulesets**, and block force pushes on your main branch.
5. **If forkguard says npm itself is infected,** reinstall Node.js from [nodejs.org](https://nodejs.org) before running npm again.
6. **Check everything else:** run `forkguard --mine` to check all your repos.
7. **Run a full antivirus scan,** and tell anyone else who works on the same repos.

---

## 15. Troubleshooting

**"forkguard is not recognized" or "command not found"**
Install it globally with `npm install -g forkguard`, then open a new terminal.

**Automatic checks do not run after setup**
Close the terminal and open a new one. Setup only takes effect in new terminals.

**"You are not logged in to GitHub yet"**
Only `--fix`, `pr` and private repos need a login. forkguard prints the steps for your computer: install the GitHub CLI and run `gh auth login`, or set a `GITHUB_TOKEN`.

**`forkguard @name` says GitHub is rate limiting you**
Without a login GitHub allows about 60 lookups an hour. Log in with `gh auth login` and the limit becomes 5,000.

**"could not download" when checking a link**
Check the link is right. For a private repo, make sure you are logged in with `gh auth login`.

**"You have uncommitted changes"**
`forkguard pr` needs a clean working tree. Run `git stash`, then try again, then `git stash pop`.

**"The origin remote is not on GitHub"**
`forkguard pr` only works with repos on GitHub. Use `forkguard fix` instead.

**It flagged something that is fine**
Skip it once with `FORKGUARD_SKIP=1`, then [report a false alarm](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml) so the rule gets better. For a skill, use the [skill false alarm form](https://github.com/PRODHOSH/forkguard/issues/new?template=skill-false-alarm.yml).

**A skill got a high score but looks harmless**
SkillSpector's static rules also flag harmless words, and its AI review never removes a finding. By default forkguard blocks only when something looks like a real attack. For a second opinion, add `--ai` (section 10). The findings show the exact text, so you can judge. See [AI agent skills](skills.md#how-to-read-a-score).

**It missed something**
[Tell us what it looked like](https://github.com/PRODHOSH/forkguard/issues/new?template=missed-malware.yml). Please describe it rather than pasting the malicious code.

---

## 16. Cheat sheet

| I want to... | Run |
| --- | --- |
| Check this folder and every project in it | `forkguard` |
| Check a GitHub repo without cloning | `forkguard owner/repo` |
| Check all my repos on GitHub | `forkguard --mine` |
| Check a friend's public repos | `forkguard @name` |
| Clean this folder | `forkguard fix` |
| Clean it on GitHub with a pull request | `forkguard pr` |
| Fix every infected repo of mine | `forkguard --mine --fix` |
| Send the fix to the repo I forked from | `forkguard pr --upstream` |
| Check my AI agent skills | `forkguard skills` |
| Check a skill before I install it | `forkguard skills owner/repo` |
| Get an AI review of a skill, with my own key | `forkguard skills owner/repo --ai` |
| Teach my AI agent forkguard | `npx skills add PRODHOSH/forkguard` |
| Check automatically from now on | `forkguard setup` |
| Turn automatic checks off | `forkguard setup --remove` |
| Skip the check once | `FORKGUARD_SKIP=1 npm install` |
| Get results as JSON | `forkguard --json` |
| See the version | `forkguard --version` |

Every command in full detail: [Commands reference](commands.md). Under the hood: [How it works](how-it-works.md).
