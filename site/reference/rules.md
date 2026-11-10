# What it catches

> Every rule, what triggers it, and what fix does about it.

forkguard was built against a malware campaign researchers call **PolinRider**, tied to North Korean threat actors. Every rule comes from real infected repos and public research. [OpenSourceMalware’s dossier](https://github.com/OpenSourceMalware/PolinRider) tracked 1,951 infected public repos across 1,047 owners as of April 11, 2026.

> **Note:** Rules marked **next release** are in the repository but not in the version on npm yet (0.3.2).

## At a glance

| Rule | Level | Looks for | Fix |
| --- | --- | --- | --- |
| [`hidden-code`](https://forkguard.pages.dev/reference/rules/#hidden-code) | HIGH | Code pushed far right behind blank spaces, or a known signature, in a code file | cut it out |
| [`loader`](https://forkguard.pages.dev/reference/rules/#loader) | HIGH | A block that decodes a URL from an env variable, downloads code and runs it | remove the block |
| [`script`](https://forkguard.pages.dev/reference/rules/#script) | HIGH | A package.json script running `node init` or a font file first | remove that step |
| [`bad-package`](https://forkguard.pages.dev/reference/rules/#bad-package) | HIGH | A known malicious npm package, in package.json or a lockfile | a person decides |
| [`bad-package-installed`](https://forkguard.pages.dev/reference/rules/#bad-package-installed) | HIGH | A known malicious package already in `node_modules` (next release) | a person decides |
| [`fake-font`](https://forkguard.pages.dev/reference/rules/#fake-font) | HIGH / MED | A font file that is really JavaScript, or not a font at all | delete |
| [`decoy-folder`](https://forkguard.pages.dev/reference/rules/#decoy-folder) | HIGH | A fonts folder planted to make the fake font look normal | delete the folder |
| [`autorun`](https://forkguard.pages.dev/reference/rules/#autorun) | HIGH / MED | A VS Code task that runs when you open the folder | remove the task |
| [`dropper`](https://forkguard.pages.dev/reference/rules/#dropper) | HIGH | `config.bat`, `temp_auto_push.bat`, `.orc`, and scripts that rewrite your last commit | delete |
| [`npm-infected`](https://forkguard.pages.dev/reference/rules/#npm-infected) | HIGH | npm itself on your computer carrying the payload | a person decides |
| [`autorun-setting`](https://forkguard.pages.dev/reference/rules/#autorun-setting) | MED | `task.allowAutomaticTasks` switched on in the project | turn it off |
| [`prelude`](https://forkguard.pages.dev/reference/rules/#prelude) | MED | Fake `createRequire` lines at the top of a config file | remove the lines |
| [`gitignore`](https://forkguard.pages.dev/reference/rules/#gitignore) | MED | `.gitignore` hiding the dropped `config.bat` | remove the line |
| [`lifecycle`](https://forkguard.pages.dev/reference/rules/#lifecycle) | MED | An install script that downloads or decodes something | a person decides |
| [`config-long-line`](https://forkguard.pages.dev/reference/rules/#config-long-line) | MED | A config file with a line of 2,000+ characters (next release) | a person decides |
| [`odd-vscode-file`](https://forkguard.pages.dev/reference/rules/#odd-vscode-file) | MED | `.vscode/extension.json`, which VS Code does not use (next release) | a person decides |
| [`env-not-ignored`](https://forkguard.pages.dev/reference/rules/#env-not-ignored) | MED | A `.env` file git is not ignoring | add it to `.gitignore` |
| [`secret`](https://forkguard.pages.dev/reference/rules/#secret) | MED | A `.env` file that is committed | `pr` removes it from git |
| [`rewritten`](https://forkguard.pages.dev/reference/rules/#rewritten) | MED | Your latest commit was rewritten after it was made | a person decides |

HIGH means it can run by itself and steal from you: do not install, run or open the project. MED means worth a look, because it does not run by itself.

## HIGH rules

### hidden-code

The signature trick of this malware. A normal line such as `export default config;` is followed by hundreds of blank spaces and then the payload, so an editor shows nothing unless you scroll far right. forkguard flags a line when it is at least 1,530 characters long, has a run of 30 or more spaces or tabs that starts within the first 400 characters, and has at least 1,500 characters after the run. The message says where: “Code hidden after 776 blank spaces on line 35”.

It also flags any code file that contains a **known signature**: strings that only show up in this malware. These are the shared globals the payload sets up, its decoder function names, the wallet addresses and endpoint hostnames it uses as a dead drop, the staging hostnames its VS Code tasks fetch from, and its encryption keys, across both the original and the April 2026 variant. The message is “Contains a known malware signature”.

**Fix:** cuts the hidden tail off every affected line and keeps your code, then looks in git history for your exact original. If the file is `init`, it is deleted. A signature with no hidden tail to cut is reported but left for you.

### loader

The second variant: no hidden spaces at all. A small async block decodes a URL kept in an environment variable (`atob(process.env.NAME)`), downloads code from it and runs it with `eval`. It is plain to see but easy to skim past. A normal `eval`, or a normal `process.env` read, is never flagged on its own.

**Fix:** removes exactly that block, then restores your original from history if the rest matches.

### script

A `package.json` script that secretly runs the hidden loader before your real command: `"dev": "node init && next dev"`. Also scripts that run a font file, or a file from a fonts folder, as code. Names that only start like these are not flagged: `node init-db.js`, `node initialize.js` and `node public/make-sitemap.js` are fine.

**Fix:** removes only the injected step and keeps the rest of the command.

### bad-package

A dependency on one of the npm packages known to carry the payload, in `dependencies`, `devDependencies`, `optionalDependencies`, or in any lockfile. All seven are Tailwind or PostCSS lookalikes:

```text
tailwindcss-style-animate
tailwind-mainanimation
tailwind-autoanimation
tailwind-animationbased
tailwindcss-typography-style
tailwindcss-style-modify
tailwindcss-animate-style
```

**Fix:** none automatically. Remove the dependency and reinstall, and treat the machine that installed it as exposed.

### bad-package-installed

**Next release.** One of those packages is already in `node_modules`, next to a `package.json`. Its install step has probably already run.

**Fix:** none automatically. Delete `node_modules`, drop the package from `package.json`, and treat the computer as exposed: rotate your tokens and keys.

### fake-font

A `.woff`, `.woff2`, `.ttf`, `.otf`, `.ttc` or `.eot` file whose first bytes are not a real font. When the content reads like JavaScript it is **HIGH**: “Pretends to be a font but is actually code”. When it is just not a font (a broken download), it is **MED**: “Is not a real font file”. The malware runs these files with Node from a VS Code task.

**Fix:** deletes the HIGH ones. The MED ones are left for you.

### decoy-folder

A folder called `font` or `fonts` that holds a fake font **and** a `README.md` mentioning “Blockchain Explorer” or “Blockchain Font”. The README is planted to make the folder look normal.

**Fix:** deletes the folder.

### autorun

A task in `.vscode/tasks.json` with `runOn: "folderOpen"`, so it runs the moment you open the folder in VS Code (after you trust it). It is **HIGH** when it runs a command (`node`, `curl`, `wget`, `powershell`, `pwsh`, `cmd`, `bash`, `sh`, `python`, anything piped to a shell, a fonts path, or a `vercel.app`, `onrender.com` or `railway.app` host) and **MED** otherwise.

**Fix:** removes only the folder-open task and keeps your other tasks. If nothing else is left, the file is deleted.

### dropper

Files this malware drops to spread itself: `config.bat`, `temp_auto_push.bat` and `.orc` files. **Next release:** any `.bat`, `.cmd` or `.sh` script that rewrites your last commit and force pushes (it reads the commit’s date, resets the clock, runs `git commit --amend --no-verify` and `git push` with force), even when it has been renamed.

**Fix:** deletes the file.

### npm-infected

The malware can hide inside npm itself, so every npm command restarts it even after your projects are clean. A healthy npm `lib/cli.js` is under 1 KB. forkguard flags it when it is over 20 KB, has a hidden tail or contains a signature. It looks at the npm that belongs to the Node.js running forkguard and the usual global locations, and never runs npm to find out.

**Fix:** none automatically. Reinstall Node.js from nodejs.org before running npm again.

## MED rules

### autorun-setting

`.vscode/settings.json` in the project switches `task.allowAutomaticTasks` on, so the hidden task can run. **Fix:** turns it to `"off"`, or deletes the file when it is the malware’s own template.

### prelude

The fake `createRequire` lines the malware adds to the top of ES module config files so its hidden code can call `require()`, in files such as `postcss.config`, `tailwind.config`, `eslint.config`, `next.config`, `vite.config`, `babel.config`, `webpack.config`, `astro.config`, `gridsome.config` and `truffle.js`. **Fix:** removes only those lines, and only the blank lines between them.

### gitignore

`.gitignore` hides `config.bat` or `temp_auto_push.bat`, the files this malware drops, so they never show up in `git status`. **Fix:** removes that line.

### lifecycle

An install-time script (`preinstall`, `install`, `postinstall`, `prepare`, `prepublish`) that uses `curl`, `wget`, `powershell`, `iwr`, `Invoke-WebRequest`, `certutil`, `base64`, `eval` or pipes into a shell. Plenty of legitimate packages do some of this, so it is MED. **Fix:** none. Read it and decide.

### config-long-line

**Next release.** A config file with a line of 2,000 characters or more. Real configs do not have lines like that; injected code does. This catches new variants that no signature knows yet. **Fix:** none. Read the file.

### odd-vscode-file

**Next release.** `.vscode/extension.json` is not a VS Code file (the real one is `extensions.json`). It has been seen in infected repos. **Fix:** none. Read it and delete it if it is not yours.

### env-not-ignored

A `.env` file (not `.env.example`) that git would happily commit. The malware has been seen taking `.env` out of `.gitignore`. **Fix:** adds `.env*` and `!.env.example` to `.gitignore`.

### secret

A `.env` file that is already committed to the repo. **Fix:** [`forkguard pr`](https://forkguard.pages.dev/commands/pr/) removes it from git while keeping it on disk. Plain `forkguard fix` leaves it, and tells you so. Either way, treat anything in it as exposed.

### rewritten

Your latest commit has the same moment recorded as author time and commit time, but in two different timezones. The malware rewrites your latest commit and keeps your name, time and message, and this is the only tell. It is only reported when a HIGH problem was also found, and never for commits made by GitHub itself. **Fix:** none. After you clean the repo, make sure the clean version is what is on GitHub.

## What it skips

To stay fast, forkguard does not look inside `node_modules`, `.git`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.vercel`, `.output`, `dist`, `build`, `out`, `coverage`, `.cache`, `.parcel-cache`, `vendor`, `__pycache__`, `.venv` and `venv`, or files over 6 MB. Malware committed only inside one of those folders is not seen.

## Report a miss or a false alarm

- Found something it misses? [Tell us what it looked like](https://github.com/PRODHOSH/forkguard/issues/new?template=missed-malware.yml). Describe it rather than pasting the malicious code.
- Got a false alarm? [Report it](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml) with the file and the message.

## Where to next

- [Reading the results](https://forkguard.pages.dev/guides/read-results/): Messages in plain words.
- [forkguard fix](https://forkguard.pages.dev/commands/fix/): What gets fixed automatically.
- [Troubleshooting](https://forkguard.pages.dev/guides/troubleshooting/): False alarms and misses.
