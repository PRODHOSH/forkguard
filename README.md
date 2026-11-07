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
