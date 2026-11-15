# forkguard commands, in full

Everything here is also on https://forkguard.pages.dev. Exit codes are the same for every command: `0` clean, `1` something dangerous, `2` forkguard could not run.

## Checking (read only)

| Command | Notes |
| --- | --- |
| `forkguard [folder]` | Checks the folder and every project inside it, however deep. Reads source files, `package.json` and lockfiles, `.vscode` files, fonts, scripts, `.gitignore` and `.env` files. Skips `node_modules`, `.git`, build output and files over 6 MB. In a git repo it also reports committed `.env` files and a rewritten latest commit. It also checks that npm on this machine is not infected, by reading npm's files, never by running npm |
| `forkguard owner/repo` | A shallow, no-checkout clone with git hooks switched off, deleted afterwards. Every branch. Also accepts a full GitHub link or any git URL |
| `forkguard @name` | Public repos of any GitHub user or organisation. Anonymous GitHub allows about 60 lookups an hour. A login or `GITHUB_TOKEN` raises that to 5,000 |
| `forkguard --mine` | Every repo the user owns. Without a login it asks which account and checks the public repos, then shows how to log in for the rest. It never reads saved passwords or tokens |
| `forkguard skills` | Skills in `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, the same folders in the current project, and `./skills` |
| `forkguard skills ./folder` | One skill, or a folder of skills. A skill is a folder with a `SKILL.md` |
| `forkguard skills owner/repo` | Also `owner/repo@skill`, GitHub links with `/tree/branch/folder`, git URLs. Downloaded to a temporary folder, read, deleted |

## Changing things

| Command | Notes |
| --- | --- |
| `forkguard fix [folder]` | Cleans every project under the folder. Files come back from git history byte for byte (CRLF kept). Fake fonts and dropped scripts are deleted. Committed `.env` files are added to `.gitignore`. `--yes` or `-y` skips the confirmation. Review with `git diff` afterwards, then commit |
| `forkguard pr [folder]` | New branch `forkguard/remove-malware`, a plain commit message, push, pull request with a plain description. `--upstream` targets the repo the user forked from. Needs `gh auth login` or a token |
| `forkguard --mine --fix` | One pull request per repo infected on its default branch. Skips repos that already have a forkguard pull request. Lists infected side branches but does not open pull requests for them. Asks once first, or use `--yes`. Needs a login |
| `forkguard setup` | Adds a marked block to the shell profile (`.zshrc`, `.bashrc`, PowerShell `profile.ps1`) that checks before `npm`, `pnpm`, `yarn`, `bun` (install, add, run, dev, start, build, test, exec, dlx), `npx`, `bunx`, `pnpx` (`skills add` only), and after `git clone`, `pull`, `merge`, `checkout`, `switch`. It can also turn off VS Code's automatic tasks. `--remove` takes it all out |
| `forkguard agent [--write]` | Prints or writes rules for AI agents |

## Skills, in more detail

Each skill gets a score from 0 to 100 using NVIDIA SkillSpector's weights. 0 to 20 looks fine, 21 to 50 is worth a look, 51 and up is "do not install". forkguard blocks (exit code 1, and stops `npx skills add`) when the score is above 50 and there is a clear attack: a CRITICAL finding with confidence 0.85 or more, or strong HIGH findings from at least two kinds of problem. `--strict` blocks on any score above 50.

Covered: 60 of SkillSpector's 115 rule ids, 472 regex rules, all 28 YARA rules. Not covered: its AI review, Python data-flow analysis, MCP checks and package vulnerability lookups. See https://github.com/PRODHOSH/forkguard/blob/main/docs/skills.md.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `FORKGUARD_SKIP=1` | Skips the automatic check once. **For the user to type, never for an agent** |
| `FORKGUARD_SKILLS_STRICT=1` | Same as `--strict` |
| `GITHUB_TOKEN`, `GH_TOKEN` | Used for `--mine`, `@name` limits and pull requests. Never print one, never ask for one in chat |

## The malware, in short

PolinRider hides JavaScript after hundreds of blank spaces on one line of a config file (`postcss.config.mjs`, `tailwind.config.js`, `eslint.config.mjs`, `next.config.js`, `vite.config.ts`), reads a hidden address from an environment variable such as `AUTH_API_KEY`, downloads code from it and runs it. It also ships fake font files, drops scripts, adds a VS Code task that runs on folder open, and rewrites the latest commit so git shows nothing new. forkguard looks for all of these.
