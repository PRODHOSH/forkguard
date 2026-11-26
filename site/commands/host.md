# forkguard host

> Is this computer affected? A read-only check of the places this malware leaves traces.

## Name

`forkguard host` looks at the computer you are on for signs of the malware. It never deletes, stops or runs anything, and it never opens a password or a key.

## Synopsis

```bash
forkguard host
forkguard host --json
```

## Description

Cleaning your repos does not tell you whether the malware ran on your computer. This does. It works on macOS, Linux and Windows and checks:

- **Hidden folders** in your home folder that the loader uses (`~/.node_modules`, and a few names public reports list), and its own files.
- **Running processes**: a node process running a hidden `init` or `service` file, a font file, or something inside the hidden folder.
- **Startup items**: launch agents (macOS), systemd and autostart (Linux), the startup folder and Run key (Windows), and cron.
- **Shell profiles** such as `.zshrc` and `.bashrc` that download and run code or start a hidden node process.
- **Shell history**: a command tied to the malware. Only the matching words are shown, never the whole line.
- **Temp folders** for dropped files, **VS Code** automatic tasks, and **global npm packages** that are known to be malicious.
- **Your projects** in the usual folders (`Developer`, `Projects`, `code`, `dev`, `src`, `repos`), with the same check as plain `forkguard`.

It also lists the logins and keys on the computer that the malware could have read if it ran here (your npm login, the GitHub CLI login, SSH keys, cloud keys). It only notes that the files exist. It never opens them.

### The result

| Result | Meaning |
| --- | --- |
| Likely affected | Something on the computer itself matches the malware. Follow the steps it prints, in order. |
| Projects infected | The computer looks fine, but some projects on it are infected. Run [`forkguard fix`](https://forkguard.pages.dev/commands/fix/). |
| Worth a look | A MED item, for example a shell profile line that downloads code. |
| Nothing found | Nothing is there right now. The malware can run once, take what it can and remove itself, so rotate your keys anyway if you ever opened an infected project. |

## Examples

```bash
forkguard host
```

## Exit status

| Code | Meaning |
| --- | --- |
| `0` | Clean, or only MED findings. |
| `1` | Something HIGH was found. |
| `2` | forkguard itself could not run. |

The same codes work in scripts and CI. See [Exit codes](https://forkguard.pages.dev/reference/exit-codes/).

## See also

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): what to do next
- [forkguard pushes](https://forkguard.pages.dev/commands/pushes/): who force-pushed to your repos

## Where to next

- [Cleaning an infected project](https://forkguard.pages.dev/guides/cleaning/): What to do next, in order.
- [forkguard pushes](https://forkguard.pages.dev/commands/pushes/): Who force-pushed to your repos.
- [Every rule](https://forkguard.pages.dev/reference/rules/): What it catches.
