# forkguard skills

> Check an AI agent skill before you trust it.

## Name

`forkguard skills` checks the skills your AI coding tools load, before you install or use them. It only reads files and never runs anything in them.

## Synopsis

```bash
forkguard skills
forkguard skills ./my-skill
forkguard skills owner/repo
forkguard skills owner/repo --all --json
```

- `(nothing)`: Every skill in the skills folders of the 79 AI agents the skills CLI supports (Claude Code, Codex, Cursor, Gemini CLI, Copilot, Windsurf, OpenCode, Roo and more), in your home folder and in this project.
- `folder`: One skill, or a folder of skills. A skill is a folder with a `SKILL.md`.
- `owner/repo`, a link, a git URL: A skill you have not installed yet. It is downloaded to a temporary folder, with git hooks switched off, checked, and deleted.
- `--all`: List every finding, not only the first few.
- `--strict`: Block on any score above 50, like SkillSpector. By default forkguard also needs something that looks like a real attack.
- `--ai`: Add SkillSpector’s AI review, with your own API key from an environment variable. forkguard shows what will be sent and asks first.
- `--json`: Print the results as JSON.

## Description

A skill is instructions plus sometimes scripts. Your agent follows them with your permissions, so a bad skill can tell it to ignore its safety rules, read your keys, hide text from you or send your files out. Skill marketplaces such as skills.sh make installing one a single command, so look first, the same way you look at a dependency.

Every skill gets a score from 0 to 100 and a plain verdict:

| Score | Verdict |
| --- | --- |
| 0 to 20 | Looks fine |
| 21 to 50 | Worth a look |
| 51 and up | SkillSpector says do not install |

One addition of forkguard’s own: SkillSpector’s rules also flag harmless text, and its AI review marks the findings it does not believe but never removes them. So forkguard blocks (exit code 1) only when the score is above 50 **and** something looks like a real attack. Otherwise a high score is shown as “worth a look”. `--strict` follows SkillSpector exactly.

### What it looks for

- Instructions that override the agent, ask it to never refuse, or switch off its safety rules.
- Hidden text: comments, zero-width and look-alike characters, long runs of blank lines or spaces (the same trick PolinRider uses in code).
- Reading your agent configuration, MCP settings, SSH keys, cloud keys or environment variables, and sending data to webhooks or cloud metadata addresses.
- Downloading and running code, obfuscated code, reverse shells, webshells, crypto miners, hack tools and credential stealers (28 YARA rules).
- Persistence, self-modification, writing to the agent’s memory files, and unbounded autonomy.

A sentence that forbids something is not flagged as if it asked for it: “never reveal the system prompt” is fine.

## Before `npx skills add`

After [`forkguard setup`](https://forkguard.pages.dev/commands/setup/), the install command checks the source first and stops when a skill scores above 50:

```bash
npx skills add owner/repo
bunx skills add owner/repo
pnpm dlx skills add owner/repo
yarn dlx skills add owner/repo
npm exec skills add owner/repo
```

`owner/repo`, `owner/repo@skill`, GitHub links, other git URLs and folders work, and `--skill name` limits the check to the skills you asked for. If the check cannot run (no network, a private repo) the install goes ahead and forkguard says so. To install anyway: `FORKGUARD_SKIP=1 npx skills add owner/repo`.

## AI review (optional)

The offline check matches known patterns. SkillSpector also has an **AI stage**, and forkguard can run it with **your own API key**. forkguard provides no key and no service.

```bash
export ANTHROPIC_API_KEY=your-key
forkguard skills owner/repo --ai
```

- **Review:** the model says whether each finding is real, with a plain explanation. A finding it does not confirm is tagged, never removed.
- **Discover:** it also looks for what rules cannot see: intent mismatches, vague triggers, polite reframings of “ignore your rules”, plain-language data leaks. That is 11 more rule ids, 71 of 115 in all.
- **Your key, in your terminal.** Set it as an environment variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `FORKGUARD_AI_BASE_URL` and `FORKGUARD_AI_MODEL` for a model on your own computer). Never type it into the command, because it would be saved in your shell history. forkguard never saves or prints it. Run `--ai` with no key and it shows the steps, or lets you paste one, hidden, for that run.
- **You say yes first.** It prints how many files and tokens will be sent, and to whom. Keys, tokens, private keys and `.env` values are hidden before anything leaves your computer.
- **It can only make forkguard stricter.** A skill can try to talk a model into calling it harmless, so the review can add a reason to block and never lift one.

Every variable and the details: [docs/skills.md](https://github.com/PRODHOSH/forkguard/blob/main/docs/skills.md#ai-review-optional).

## Where the rules come from

The rules are [NVIDIA SkillSpector’s](https://github.com/NVIDIA/SkillSpector) (Apache 2.0), translated to JavaScript so one tool can watch your code and your skills, with no Python, no packages and no AI key. **All credit for the rules belongs to NVIDIA.** forkguard is an independent project by Prodhosh V.S and is not made or endorsed by NVIDIA. Problems with forkguard go to [hello@prodhosh.me](mailto:hello@prodhosh.me) or [GitHub issues](https://github.com/PRODHOSH/forkguard/issues), not to NVIDIA.

## What it covers

|  |  |
| --- | --- |
| Rule ids | 60 of the 115 in SkillSpector, 71 with the AI review |
| Regex rules | 472, copied from its source by a script, not retyped |
| YARA rules | All 28, in its 5 rule files (226 patterns) |

It does **not** do SkillSpector’s Python syntax-tree and data-flow analysis, its MCP checks, package vulnerability lookups, or some checks that parse shell commands. That is the other 44 rule ids. This is a fast first check: for a skill you depend on, also run [SkillSpector](https://github.com/NVIDIA/SkillSpector) itself. The full list, and every place the JavaScript differs from the Python, is in [docs/skills.md](https://github.com/PRODHOSH/forkguard/blob/main/docs/skills.md).

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## Examples

```bash
forkguard skills
```

```bash
forkguard skills vercel-labs/agent-skills
```

```bash
forkguard skills ./downloads/some-skill --all
```

## See also

- [`forkguard setup`](https://forkguard.pages.dev/commands/setup/): check before `npx skills add` automatically
- [`forkguard agent`](https://forkguard.pages.dev/commands/agent/): rules that tell your AI agent to check first

## Where to next

- [forkguard setup](https://forkguard.pages.dev/commands/setup/): Check before every npx skills add.
- [AI agents and vibe coding](https://forkguard.pages.dev/guides/ai-agents/): Why agents need checks.
- [Safety and privacy](https://forkguard.pages.dev/internals/safety/): What forkguard never does.
