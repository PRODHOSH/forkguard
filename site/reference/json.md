# JSON output

> Add `--json` to read results from a script or an agent.

## A folder

```bash
forkguard ./app --json
```

```json
{
  "root": "/home/me/app",
  "checked": 433,
  "findings": [
    {
      "level": "high",
      "file": "init",
      "rule": "hidden-code",
      "message": "Code hidden after 776 blank spaces on line 35",
      "fix": "delete"
    }
  ]
}
```

## A GitHub repo

```bash
forkguard someone/their-repo --json
```

```json
{
  "name": "someone/their-repo",
  "url": "https://github.com/someone/their-repo",
  "branches": [
    {
      "name": "main",
      "checked": 112,
      "findings": []
    }
  ]
}
```

If the repo could not be downloaded you get `{ name, url, error }` instead, and the exit code is `2`.

## All your repos

`forkguard --mine --json` prints a list of the repo results above, one per repo, sorted by name. Each also has an `archived` field.

## Fields

| Field | Meaning |
| --- | --- |
| `level` | `"high"` or `"medium"`. |
| `file` | The file, relative to the project. A few findings use a label such as `(latest commit)` or a path to npm itself. |
| `rule` | Which check found it. See the list below. |
| `message` | What is wrong, in plain words. |
| `fix` | What `forkguard fix` will do, or `null` if a person has to decide. |
| `checked` | How many files were looked at. |
| `root` | The folder that was checked, resolved to a real path. |

## Rule ids

Each id is explained in [What it catches](https://forkguard.pages.dev/reference/rules/).

```text
hidden-code   loader        script         lifecycle
bad-package   bad-package-installed   fake-font
decoy-folder  autorun       autorun-setting dropper
gitignore     prelude       config-long-line odd-vscode-file
env-not-ignored   secret    rewritten      npm-infected
```

## Fix values

| `fix` | What fix does |
| --- | --- |
| `delete` | Deletes the file. |
| `delete-dir` | Deletes the folder. |
| `strip` | Cuts the malware out of your file. |
| `script` | Removes the injected step from a package.json script. |
| `autorun` | Removes the folder-open task from `.vscode/tasks.json`. |
| `setting` | Turns automatic tasks off in `.vscode/settings.json`. |
| `gitignore` | Removes the malware’s line from `.gitignore`. |
| `ignore-env` | Adds `.env*` rules to `.gitignore`. |
| `untrack` | Removes a committed `.env` from git, keeping it on disk. Only `forkguard pr` does this. |
| `null` | A person has to decide. |

## Read it in a script

```bash
forkguard --json | jq '.findings[] | select(.level == "high") | "\(.file): \(.message)"'
```

## Where to next

- [Exit codes](https://forkguard.pages.dev/reference/exit-codes/): The three codes.
- [AI agents](https://forkguard.pages.dev/guides/ai-agents/): Using JSON from an agent.
- [GitHub Action](https://forkguard.pages.dev/guides/github-action/): Use it in CI.
