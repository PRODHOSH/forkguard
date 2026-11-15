<p align="center">
  <a href="https://github.com/PRODHOSH/forkguard">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="site/assets/brand/logo-on-dark.svg">
      <img src="site/assets/brand/logo.svg" alt="forkguard" height="56">
    </picture>
  </a>
</p>

# Contributing to forkguard

Thanks for helping. forkguard is open source under the [Apache 2.0 license](LICENSE), and every new rule makes the next developer a little safer. You do not have to write code to contribute: a good bug report is worth as much.

## Ways to help

| I want to... | Do this |
| --- | --- |
| Report malware forkguard missed | Open a [Missed something](https://github.com/PRODHOSH/forkguard/issues/new?template=missed-malware.yml) issue. Describe the shape of it, never paste the malicious code |
| Report a false alarm | Open a [False alarm](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml) issue. For a skill, use [Skill false alarm](https://github.com/PRODHOSH/forkguard/issues/new?template=skill-false-alarm.yml) |
| Suggest something | Open an [idea](https://github.com/PRODHOSH/forkguard/issues/new?template=idea.yml) |
| Report a bug | Open a [bug](https://github.com/PRODHOSH/forkguard/issues/new?template=bug.yml) |
| Fix or build something | Fork, branch, change, test, open a pull request (below) |
| Improve the docs | Edit a page in `tools/docs/pages/` or a file in `docs/`, then `npm run docs` |
| Report a security problem in forkguard | Email hello@prodhosh.me. Do not open a public issue. See [SECURITY.md](SECURITY.md) |

If you are not sure whether a change is wanted, open an issue first and ask. Small, focused pull requests get reviewed fastest.

## What to put in a report

**A trick forkguard missed:** which file it was in and what the file was called, what looked wrong (for example "a long run of spaces after the last line"), and how it got in if you know. Please do not paste the actual malicious code. Describe its shape, or share only the first few characters.

**A false alarm:** the file name, and the message forkguard printed. If the project is public, a link helps a lot. For a skill, the skill's `owner/repo`, the rule id (like `AR2`) and the text that matched.

## Set up

You need [Node.js](https://nodejs.org) 18 or newer and [git](https://git-scm.com). There is no install step, because forkguard has no dependencies.

```bash
git clone https://github.com/PRODHOSH/forkguard
cd forkguard
npm test                       # runs every test
node bin/forkguard.js .        # forkguard checks itself. It must stay clean
node bin/forkguard.js --help
```

## Where things are

| Path | What it is |
| --- | --- |
| `bin/forkguard.js` | The command line: reads your command and runs the right part |
| `src/rules.js`, `src/scan.js` | What PolinRider looks like, and the walk that applies it |
| `src/fix.js`, `src/pr.js`, `src/githubfix.js` | Cleaning, the pull request, and `--mine --fix` |
| `src/remote.js`, `src/auth.js` | Checking GitHub links and repos, and logging in |
| `src/setup.js`, `src/agent.js` | The shell hooks, and the rules for AI agents |
| `src/skills/` | The skill checks: SkillSpector's rules in JavaScript (see below). `agents.js` lists the 79 agents' skill folders, from the skills CLI docs. `ai/` is the optional AI review |
| `skills/forkguard/` | The forkguard skill you give an AI agent |
| `test/` | Tests (`node:test`) |
| `docs/` | The documentation as Markdown |
| `tools/docs/` and `site/` | The docs site generator, and its generated output |
| `tools/skillspector/` | Scripts that copy rule data out of SkillSpector |

How it all fits together: [How it works](docs/how-it-works.md#8-architecture).

## Sending a pull request

1. Fork the repo and create a branch.
2. Make your change. Keep it simple and keep **zero dependencies**.
3. Add a test. Build fake payloads from harmless text at runtime, like the existing tests do, so antivirus does not delete the test files.
4. Run `npm test` and `node bin/forkguard.js .`. Both must pass.
5. If you changed what the docs say, update them and run `npm run docs` (see below).
6. Open the pull request and explain what it catches or fixes, and why.

Write commit messages as plain sentences about what changed: `Catch fake fonts that are really scripts`.

CI runs on Linux, Windows and macOS with Node 18, 20 and 22. If it is red, the cause is in the log.

## Ground rules

- **No dependencies.** forkguard runs before `npm install`, so it must not need one.
- **It never runs code** from the project or skill it checks. It only reads files.
- **Git hooks stay off** whenever forkguard calls git, because an infected repo can ship its own.
- **Plain, friendly wording** in everything a user sees. No jargon where a short word works.
- **Never put real malware in the repo**, a test or an issue.
- **Be kind.** Assume good intent, explain your reasoning, and thank people for their time. Harassment of any kind is not welcome here, and the maintainer may remove comments or contributors who cross that line.

## Working on the skill checks

`forkguard skills` is built on [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) (Apache 2.0). Because of that:

- **Do not edit `src/skills/data/` by hand.** Rule text, confidences and YARA files are copied from SkillSpector by a script, so none is retyped. To refresh it from a SkillSpector checkout: `node tools/skillspector/build-data.mjs /path/to/SkillSpector`. The result is the same bytes you see in git.
- **To change what a rule does,** edit the module in `src/skills/modules/`, and say in the pull request what SkillSpector does so the difference can be reviewed. The differences from SkillSpector that already exist are listed in [AI agent skills](docs/skills.md#where-it-differs-from-skillspector).
- **Keep the credit.** Every file under `src/skills/` carries the SPDX line and the NVIDIA copyright notice. New files in there that are derived from SkillSpector must too. [NOTICE](NOTICE) must keep saying what was taken and what was changed. This is what the Apache 2.0 license asks for.
- **The AI review** lives in `src/skills/ai/`. Its prompts are in `src/skills/data/ai-prompts.json`, copied from SkillSpector by the same script. Do not edit that file by hand. Keep the rules that protect users: secrets are hidden before anything is sent (`redact.js`), the user is told what is sent and asked first, a key is only ever read from the environment, and the review may add a reason to block but never lift a block. Tests use a pretend provider on your own machine (`test/ai.test.js`), so no real key or network is needed.
- **Numbers in the docs come from `node tools/skillspector/stats.mjs`.** If you add or remove a rule, run it and update the README and `docs/skills.md`.
- A wrong skill rule is [reported here](https://github.com/PRODHOSH/forkguard/issues/new?template=skill-false-alarm.yml). Please do not report forkguard problems to NVIDIA.

## Working on the documentation

The docs site lives in [`site/`](site/) and is generated from the pages in `tools/docs/pages/`. The Markdown in [`docs/`](docs/README.md) and the README are written by hand and should say the same thing. Edit a page, then rebuild:

```bash
npm run docs
python3 -m http.server 4173 --directory site
```

Then open http://localhost:4173. Commit the regenerated `site/` together with your change: CI fails if they disagree. See [`tools/docs/README.md`](tools/docs/README.md) for the full picture. The live site is [forkguard.pages.dev](https://forkguard.pages.dev).

## Publishing the forkguard skill

The skill is the folder `skills/forkguard`: a `SKILL.md` with `name` and `description`, plus `references/`. The skills CLI finds it in a public GitHub repo at `skills/<name>/SKILL.md`, so there is nothing to upload: `npx skills add PRODHOSH/forkguard` works as soon as the change is on `main`. [skills.sh](https://skills.sh) lists a skill automatically once people install it with that command. There is no submission step.

Before you push a change to the skill: `forkguard skills skills/forkguard` should score 0, the name must stay `forkguard` (it must match the folder), and the description must stay under 1,024 characters and avoid colons and quotation marks. `npm test` checks all of it.

## Releasing (maintainer)

1. Update the version in `package.json` and the `@v0.x.x` examples in the README and docs, then `npm run docs`.
2. `npm test`, then commit and push to `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`, then `npm login` and `npm publish`.
4. Create a GitHub release for the tag with a plain-words title and description.

## Your contribution and the license

By sending a pull request you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), like the rest of forkguard (Section 5 of the license). You keep your copyright. You do not need to sign anything else.

## Questions

Ask in an [issue](https://github.com/PRODHOSH/forkguard/issues) or write to [hello@prodhosh.me](mailto:hello@prodhosh.me). Thank you for making this safer for everyone.
