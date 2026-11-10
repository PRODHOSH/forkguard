# Check a repo before you clone it

> The safest way to look at a repo you do not know yet.

A common way this malware reaches developers is a coding test or “take-home project” sent by a recruiter, or a repo you found online. It arrives as a normal-looking repo. You clone it, open it in VS Code or run `npm install`, and it runs.

## Check the link first

```bash
forkguard recruiter/take-home-test
```

That downloads only the latest commit of every branch into a temporary folder, reads it from git’s database without unpacking the files, and deletes the download. [Details](https://forkguard.pages.dev/commands/check-repo/).

- Result says **looks clean**: you can clone and open it.
- Result shows anything **HIGH**: do not clone it, do not open it and do not run it.

## Clone only if it was clean

```bash
forkguard recruiter/take-home-test && git clone https://github.com/recruiter/take-home-test
```

Then check the folder once more after cloning:

```bash
cd take-home-test
forkguard
```

## Open it carefully

- When VS Code asks whether you trust the authors of the folder, choose **No** unless you have checked it. Untrusted folders open in Restricted Mode, where tasks do not run. Reports on this campaign describe that prompt as the main gate.
- Turn off automatic tasks for good with [`forkguard setup`](https://forkguard.pages.dev/commands/setup/). It sets `task.allowAutomaticTasks` to `"off"`.
- To only read the code, you can open a repo in the browser with github.dev, which does not run local tasks.
- Do not run install or start scripts until you have read `package.json`.

## Things to look at yourself

| Where | What looks wrong |
| --- | --- |
| `package.json` scripts | A script that runs `node init`, or a file from a fonts or assets folder, before the real command |
| `.vscode/tasks.json` | Any task with `"runOn": "folderOpen"` |
| `public/fonts`, `static`, `assets` | A font file you cannot open as a font |
| Config files (`postcss.config.mjs`, `tailwind.config.js`, `next.config.mjs`, `vite.config.js`) | Scroll all the way to the right on the longest line |
| Dependencies | An unfamiliar “tailwind-something” or “style-animate” package |

> **Warning:** forkguard checks for the tricks it knows. It is not a sandbox. If a repo comes from someone you do not trust, run it in a throwaway virtual machine or container even when it looks clean.

## Where to next

- [forkguard owner/repo](https://forkguard.pages.dev/commands/check-repo/): The command in full.
- [Automatic protection](https://forkguard.pages.dev/guides/automatic-protection/): Check after every git clone.
- [Safety and privacy](https://forkguard.pages.dev/internals/safety/): What forkguard cannot do.
