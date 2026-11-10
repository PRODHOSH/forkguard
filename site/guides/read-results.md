# Reading the results

> What each line means, and what to do about it.

## The three parts of a line

```text
  HIGH  package.json  "dev" runs a hidden file called init before your real command
```

1. **The level.** HIGH can run by itself and steal from you. MED is worth a look but does not run by itself.
2. **The file.** Where it is, relative to the folder you checked. For a GitHub check the lines are grouped by branch.
3. **The message.** What is wrong, in plain words.

| Level | What to do |
| --- | --- |
| HIGH | Do not install, run or open the project. Clean it first with [`forkguard fix`](https://forkguard.pages.dev/commands/fix/) or [`forkguard pr`](https://forkguard.pages.dev/commands/pr/). |
| MED | Read it and decide. Most can be fixed with `forkguard fix`. |

## Common messages

| Message | It means | What to do |
| --- | --- | --- |
| Code hidden after N blank spaces on line L | The payload sits far to the right of a normal line, where editors do not show it. | `forkguard fix` cuts it out and restores your original from git history. |
| Contains a known malware signature | The file has a string that only appears in this malware. | Read the file. `forkguard fix` removes it when the hidden part can be cut. |
| Downloads code from a hidden URL in an env variable and runs it | The second variant: a small block that decodes a URL, downloads code and runs it. | `forkguard fix` removes that block. |
| "dev" runs a hidden file called init before your real command | A package.json script runs the loader first. | `forkguard fix` removes just that step. |
| Pretends to be a font but is actually code | A `.ttf` or `.woff2` file that is JavaScript. | `forkguard fix` deletes it. |
| Decoy fonts folder planted to hide the fake font | A fonts folder with a fake font and a planted README. | `forkguard fix` deletes the folder. |
| VS Code task runs a hidden command the moment you open the folder | A `.vscode/tasks.json` task that starts on folder open. | `forkguard fix` removes that task. |
| File this malware drops to spread itself | `config.bat`, `temp_auto_push.bat` or a `.orc` file. | `forkguard fix` deletes it. |
| Depends on … a known malicious package | A dependency on a package known to carry the payload. | Remove it from package.json and reinstall. Treat the machine that installed it as exposed. |
| npm itself is infected | npm on this computer carries the payload. | Reinstall Node.js from nodejs.org before running npm again. |
| Commit … was rewritten: same time, different timezone | Your latest commit was amended after you made it. | Clean the repo and push the clean version. See [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/). |
| Secret file is committed to the repo | A `.env` file is in git. | `forkguard pr` removes it from git. Rotate whatever is in it. |
| Secret file is not in .gitignore | A `.env` file could be committed by accident. | `forkguard fix` adds the rule. |

Every rule in full: [What it catches](https://forkguard.pages.dev/reference/rules/).

## “Looks clean” is not a guarantee

forkguard finds the tricks it knows. A clean result means none of those tricks are present, not that the project is safe. Read [Safety and privacy](https://forkguard.pages.dev/internals/safety/) for what it cannot do.

## Where to next

- [Every rule](https://forkguard.pages.dev/reference/rules/): Full detail for each finding.
- [forkguard fix](https://forkguard.pages.dev/commands/fix/): Clean what it found.
- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): The checklist.
