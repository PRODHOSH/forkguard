<div align="center">

# forkguard

**Catch malware hidden in a repo before you install or run it.**

[![npm](https://img.shields.io/npm/v/forkguard?color=7F00FF&label=npm)](https://www.npmjs.com/package/forkguard)
[![CI](https://github.com/PRODHOSH/forkguard/actions/workflows/ci.yml/badge.svg)](https://github.com/PRODHOSH/forkguard/actions/workflows/ci.yml)
![Dependencies](https://img.shields.io/badge/dependencies-0-7F00FF)
[![License](https://img.shields.io/badge/license-MIT-7F00FF)](LICENSE)

**[Getting started](docs/getting-started.md)** &nbsp;|&nbsp; **[How it works](docs/how-it-works.md)** &nbsp;|&nbsp; **[The story](https://blog.prodhosh.me/blog/malware-hid-in-my-old-repos-polinrider)**

</div>

---

## Try it now

Inside any project folder:

```bash
npx forkguard
```

If it is clean:

```text
forkguard  my-app looks clean (433 files checked)
```

If it is not:

```text
forkguard  my-app

  HIGH  init          Code hidden after 776 blank spaces on line 35
  HIGH  package.json  "dev" runs a hidden file called init before your real command

  2 problems found. Do not run npm install, npm run dev or open this folder in VS Code yet.
```

## What you can do

| Command | What it does |
| --- | --- |
| `forkguard` | Checks a project |
| `forkguard fix` | Cleans it |
| `forkguard pr` | Cleans it on GitHub with a pull request |
| `forkguard setup` | Checks automatically before every `npm install` and after every `git clone` |

New here? The **[Getting started guide](docs/getting-started.md)** walks you through each one, step by step.

## Which one are you?

Click your situation.

<details>
<summary><b>I am forking or cloning someone's repo. Is it safe?</b></summary>
<br>

Check it **before** you open it in VS Code or install anything.

1. Clone it from the terminal, not from VS Code:

   ```bash
   git clone https://github.com/someone/their-repo
   ```

2. Check it:

   ```bash
   npx forkguard their-repo
   ```

3. Only if it says **looks clean**, open it and run `npm install`.

Why the terminal? The malware can start the moment VS Code opens the folder. Nothing runs in the terminal until you run it.

</details>

<details>
<summary><b>Is my own repo clean?</b></summary>
<br>

Pull first, because the malware gets into GitHub, not your laptop. Then check:

```bash
cd my-repo
git pull
npx forkguard
```

If it finds something, `forkguard fix` cleans your copy and `forkguard pr` cleans GitHub too.

</details>

<details>
<summary><b>Is my repo clean on GitHub?</b></summary>
<br>

Let GitHub check it for you on every push. Add this file to the repo as `.github/workflows/forkguard.yml`:

```yaml
name: forkguard
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PRODHOSH/forkguard@v0.2.0
```

If malware ever lands, the build turns red and GitHub emails you.

Signs you can also spot by eye on GitHub:

- An old repo you have not touched says **updated a few hours ago**
- A pull request shows **force-pushed** when you did not force push
- Signed commits suddenly show **Unverified**
- Vercel or Netlify builds start failing on projects you have not changed

</details>

<details>
<summary><b>Someone sent me a repo for a job interview or coding test</b></summary>
<br>

This is one of the main ways this malware spreads, so treat it with care.

1. Clone it from the terminal into any folder.
2. Run `npx forkguard <folder>`.
3. Do not open it in VS Code or run anything until it says **looks clean**.

If it finds something, do not run it at all. Tell the person who sent it.

</details>

<details>
<summary><b>I never want to think about this again</b></summary>
<br>

Install it once and turn on automatic checks:

```bash
npm install -g forkguard
```

```bash
forkguard setup
```

Open a new terminal. From now on forkguard checks every project before `npm install` or `npm run dev`, and right after every `git clone` or `git pull`. Clean projects stay silent. Dangerous ones are stopped before anything runs.

</details>

<details>
<summary><b>forkguard found something. What now?</b></summary>
<br>

The order matters.

1. Do not run `npm install` or `npm run dev`, and do not open the folder in VS Code.
2. Run `forkguard fix`, or `forkguard pr` to fix GitHub too.
3. From another device, change your GitHub tokens, SSH keys, npm token, cloud keys and `.env` secrets.
4. Block force pushes on your main branch: **Settings**, then **Rules**, then **Rulesets**.
5. Run a full antivirus scan.

[Full checklist](docs/getting-started.md#9-found-something-do-this-next)

</details>

## Why it exists

Some malware hides inside ordinary repos. It sits after hundreds of spaces at the end of a normal line, so your editor shows nothing, and it rewrites commits without changing the author or date, so git shows nothing either. It runs when you open the folder in VS Code or type `npm run dev`, then steals your tokens and passwords and spreads to every repo you can push to.

It hit 35 of my 53 repos. Antivirus caught pieces of it but could not tell me which repos were infected or how to fix them. forkguard is the tool I wish I had that day.

Full story on my blog: **[Malware Hid in My Old Repos and Git Never Showed It](https://blog.prodhosh.me/blog/malware-hid-in-my-old-repos-polinrider)**

## Why trust it

- **Zero dependencies.** Nothing gets installed alongside it.
- **Never runs project code.** It only reads files.
- **Sends nothing anywhere.** Your code stays on your machine.
- **Gives your work back.** When it cleans a file, it restores your exact original from git history if it can.
- **Tested** on Linux, Windows and macOS.

## Use it in GitHub Actions

```yaml
- uses: actions/checkout@v4
- uses: PRODHOSH/forkguard@v0.2.0
```

The build fails if malware shows up. [More options](docs/getting-started.md#8-use-it-in-github-actions)

## Contributing

forkguard is open source. Found something it misses, or a false alarm? [Open an issue](https://github.com/PRODHOSH/forkguard/issues/new/choose). Pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Developer

<table>
  <tr>
    <td>
      <a href="https://github.com/PRODHOSH"><img src="https://github.com/PRODHOSH.png" width="96" alt="Prodhosh V.S"></a>
    </td>
    <td>
      <b>Prodhosh V.S</b><br>
      Built forkguard after this malware hit my own repos.<br><br>
      <a href="https://prodhosh.me">prodhosh.me</a> &nbsp;|&nbsp;
      <a href="mailto:hello@prodhosh.me">hello@prodhosh.me</a> &nbsp;|&nbsp;
      <a href="https://github.com/PRODHOSH">github.com/PRODHOSH</a>
    </td>
  </tr>
</table>

If forkguard saved you from a bad day, a star helps other developers find it.

## License

MIT
