# Checking AI agent skills

`forkguard skills` checks the skills your AI coding tools load (Claude Code, Codex, Cursor, Gemini CLI, OpenCode and others). A skill is a folder with a `SKILL.md` and sometimes scripts. Your agent follows it with your permissions, so a bad one can tell the agent to ignore its safety rules, read your keys or send your files out.

```bash
forkguard skills                  # every skill already on this computer
forkguard skills ./my-skill       # one skill, or a folder of skills
forkguard skills owner/repo       # a skill on GitHub, before you install it
forkguard skills owner/repo --all # list every finding
forkguard skills ./my-skill --strict   # block on any score above 50, like SkillSpector
forkguard skills ./my-skill --json
```

Each skill gets a score from 0 to 100:

| Score | Verdict |
| --- | --- |
| 0 to 20 | Looks fine |
| 21 to 50 | Worth a look |
| 51 and up | SkillSpector says do not install |

**forkguard's own addition.** SkillSpector's static rules also flag harmless text ("never judge a logo", `--use-mock-keychain`), and SkillSpector uses an AI review to throw those away. forkguard has no AI review, so it blocks (exit code 1, and it stops `npx skills add`) only when the score is above 50 **and** something looks like a real attack: a CRITICAL finding with confidence 0.85 or more, or strong HIGH findings (confidence 0.8 or more, not marked "probably an example") from at least two kinds of problem. Otherwise a high score is shown as "worth a look". The score and the findings are SkillSpector's, unchanged. Add `--strict`, or set `FORKGUARD_SKILLS_STRICT=1`, to follow SkillSpector exactly and block on any score above 50.

## Where it looks

With no argument: `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, `~/.config/agents/skills`, the same folders inside the project you are in, and `./skills`. A skill is any folder that holds a `SKILL.md`. Symlinks are never followed. Files over 1 MB and binary files are skipped.

## Before you install: `npx skills add`

After `forkguard setup`, these commands check the source first and stop the install when a skill scores above 50:

```
npx skills add owner/repo          bunx skills add owner/repo       pnpx skills add owner/repo
pnpm dlx skills add owner/repo     yarn dlx skills add owner/repo   npm exec skills add owner/repo
```

`owner/repo`, `owner/repo@skill`, GitHub links (also `/tree/<branch>/<folder>`), other git URLs and local folders all work. `--skill name` limits the check to the skills you asked for. The source is downloaded to a temporary folder with git hooks switched off, read, and deleted. Nothing in it is run. If the check cannot run (no network, a private repo), forkguard says so and the install goes ahead. To install anyway: `FORKGUARD_SKIP=1 npx skills add owner/repo`.

## Where the rules come from

The rules are [NVIDIA SkillSpector's](https://github.com/NVIDIA/SkillSpector) (Apache 2.0). forkguard translated them to JavaScript so one tool can check your code and your skills, with no Python, no packages and no AI key. All credit for the rules belongs to NVIDIA. forkguard is an independent project by Prodhosh V.S and is not made or endorsed by NVIDIA. See [NOTICE](../NOTICE) for exactly what was taken and what was changed.

Problems with forkguard or a wrong rule: [hello@prodhosh.me](mailto:hello@prodhosh.me) or [GitHub issues](https://github.com/PRODHOSH/forkguard/issues). Not NVIDIA.

## What is covered, by the numbers

Counted by `node tools/skillspector/stats.mjs`.

| | |
| --- | --- |
| Rule ids covered | 60 of the 115 that SkillSpector's source defines |
| Regex rules | 472, copied from SkillSpector's source by a script (`tools/skillspector/extract_tables.py`), not retyped |
| YARA rules | 28 of 28, in SkillSpector's 5 rule files, unchanged (226 patterns) |
| Rule modules ported | 15 static pattern modules, plus the YARA runner |
| Constants copied | 688 tables and regexes from 19 SkillSpector modules (`src/skills/data/tables.json`), plus its table of 1,515 look-alike letters |

### The 60 rule ids that are covered

| Group | Rule ids |
| --- | --- |
| Prompt injection | P1 instruction override, P2 hidden instructions, P3 exfiltration commands, P4 behaviour manipulation, P5 harmful content, P9 whitespace padding |
| System prompt leakage | P6, P7, P8 |
| Data exfiltration | E1 to E5 |
| Privilege escalation | PE1 to PE5 |
| Supply chain | SC1 unpinned dependencies, SC2 remote script execution, SC3 obfuscated code, SC7 untrusted container image |
| Excessive agency | EA1 to EA5 |
| Output handling | OH1 to OH3 |
| Memory poisoning | MP1 to MP3 |
| Tool misuse | TM1 to TM4 |
| Rogue agent | RA1 self-modification, RA2 persistence |
| Trigger abuse | TR1 to TR3 |
| Agent snooping | AS1 to AS3 |
| Anti-refusal | AR1 to AR3 |
| SSRF | SSRF1 to SSRF3 |
| Insecure deserialization (PHP, Ruby, JavaScript) | DS1 to DS4 |
| YARA | YR1 malware, YR2 webshells, YR3 crypto miners, YR4 hack tools |

### What it does not do (the other 55 rule ids)

| Rule ids | What they are | Why not here |
| --- | --- | --- |
| AST1 to AST10, TT1 to TT6 | Python syntax-tree and data-flow checks (`exec`, `eval`, secrets flowing to the network) | Needs a Python parser. The text rules still catch the common shapes, but with less precision |
| SDI-1 to 4, SQP-1 to 3, SSD-1 to 4 | AI review: does the description match what the code does, is the skill any good | Needs an AI model and an API key. forkguard stays offline |
| LP1 to LP4, TP1 to TP4, RP1 to RP3 | MCP checks: permissions, tool poisoning, a tool that changes between versions | Needs the MCP and permission parsers |
| BH1 to BH4 | Hooks and settings bundled in a skill | Needs the hook and settings analysis |
| SC4, SC5, SC6 | Known vulnerable, abandoned and look-alike dependencies | Needs network lookups (OSV, registries) |
| SC8, SC9, SC10 | Shipped Python bytecode, executables hidden inside documents, redirected package sources | Not ported yet |
| AE1 to AE7 | SkillSpector's own notes about files it could not analyse | Part of its scan ledger |

## Where it differs from SkillSpector

These are the places where the JavaScript is not the same as the Python, so a result can differ:

- **Possessive and atomic regex groups** (`a++`, `(?>...)`) become ordinary greedy groups, because JavaScript has no such thing. It can only change which text is matched in rare backtracking cases. Two patterns that use a conditional group (`(?(name)...)`) are a little more lenient than the original.
- **Python files** are checked with the text rules SkillSpector uses as its fallback, where it would otherwise parse the file. Examples: E2 (environment harvesting), OH1 (output into a command), PE3 for paths built in code. Expect somewhat more findings in Python code.
- **Context checks that need Python's parsers** are not ported: the shell-command proofs that lower or remove SC2, E1, E5 and TM1 findings, the JavaScript regexp-literal check for OH1, the Python comment check for AR2, and the "returns a local value" and "report label" checks for P6. These only make SkillSpector quieter, so forkguard may report a few findings it would not.
- **The security view** (look-alike letters folded to ASCII, invisible characters dropped) is simplified. SkillSpector also builds a letter-spacing view and declared-marker views for P3 and P4. They are not built here.
- **Documents and archives** (docx, xlsx, zip, tar) are not opened. Only text files are read.
- The text of rules, their confidences and severities, the scoring and the YARA rules are the same.

## Testing

`npm test` runs the skills tests next to the rest. They check that every pattern compiles, that all 28 YARA rules load, the score arithmetic, the exemptions for prohibitions ("never reveal the system prompt"), look-alike letters, padding, the `npx skills add` guard and the exit codes. On SkillSpector's own sample skills, forkguard scores `safe_skill` 0 and `malicious_skill` 100 (P5 poisoned recipe, E1 and E2 sending data out). SkillSpector itself needs Python 3.12 or newer, which was not available when this was built, so the scores have not been compared with its own output line by line. If you find a skill where the two disagree, please send it to [hello@prodhosh.me](mailto:hello@prodhosh.me).
