# Options

> Every flag, and where it works.

| Option | Works with | What it does |
| --- | --- | --- |
| `--json` | checking a folder, a link, or `--mine` | Print the results as JSON instead of text. See [JSON output](https://forkguard.pages.dev/reference/json/). |
| `--mine` | on its own | Check your GitHub repos. Works without a login for public repos. See [`forkguard --mine`](https://forkguard.pages.dev/commands/mine/). |
| `--fix` | `--mine` | Open one pull request for each infected repo. Needs a GitHub login. See [`forkguard --mine`](https://forkguard.pages.dev/commands/mine/). |
| `--yes`, `-y` | `fix`, `--mine --fix` | Do not ask before changing several projects, opening pull requests or sending text to an AI provider. For scripts. |
| `--upstream` | `pr` | Send the pull request to the repo you forked from. See [`forkguard pr`](https://forkguard.pages.dev/commands/pr/). |
| `--remove` | `setup` | Take the automatic checks back out of your shell profile. |
| `--write` | `agent` | Add the agent rules to AGENTS.md, CLAUDE.md and similar files instead of printing them. |
| `--ai` | `skills` | Adds SkillSpector’s AI review, with your own API key from an environment variable. forkguard shows what will be sent and asks first. |
| `--strict` | `skills` | Block on any score above 50, like SkillSpector, instead of also needing a clear attack. Same as `FORKGUARD_SKILLS_STRICT=1`. |
| `--all` | `skills` | List every finding, not only the first few. See [`forkguard skills`](https://forkguard.pages.dev/commands/skills/). |
| `--version`, `-v` | anything | Print the version. |
| `--help`, `-h` | anything | Print all commands. |

## Commands

| Command | Argument |
| --- | --- |
| `forkguard [folder]` | A folder to check. Defaults to the current folder. |
| `forkguard <owner/repo or url>` | A GitHub repo or any git URL to check. |
| `forkguard fix [folder]` | A folder to clean. |
| `forkguard pr [folder]` | A git repo to clean and open a pull request on. |
| `forkguard skills [folder or owner/repo]` | A skill folder, a folder of skills, or a skill source. Defaults to the skills installed on this computer. |
| `forkguard setup` | No argument. |
| `forkguard agent [folder]` | A folder whose agent files to write. Defaults to the current folder. |

## Internal

`forkguard --gate <tool> <args…>` is what the shell hooks call (tools: npm, pnpm, yarn, bun, npx, bunx, pnpx, git). It exists for `forkguard setup`, and is not meant to be typed by hand. It exits `1` to stop a package manager and `0` otherwise.

> **Note:** `fix`, `pr`, `setup` and `agent` are commands, not flags. They go first: `forkguard fix ./app`, not `forkguard ./app fix`.

## Where to next

- [Exit codes](https://forkguard.pages.dev/reference/exit-codes/): What each code means.
- [Environment variables](https://forkguard.pages.dev/reference/environment/): FORKGUARD_SKIP and tokens.
- [forkguard](https://forkguard.pages.dev/commands/check/): The check command.
