# About

> A free, open source tool, built after this malware turned up in my own old repos.

**Prodhosh V.S**: Full-stack developer and designer in Chennai, India. Built forkguard after PolinRider hid in his own repos.

- [GitHub](https://github.com/PRODHOSH)
- [LinkedIn](https://www.linkedin.com/in/prodhoshvs)
- [prodhosh.me](https://prodhosh.me)
- [Blog](https://blog.prodhosh.me)
- [X](https://x.com/prodhosh3)

## Why it exists

It started with emails from Vercel. Production builds were failing on old projects I had not touched in months, all with the same useless message: `npm run build exited with 1`. I opened `postcss.config.mjs` in one of them and scrolled right. After `export default config;` there were hundreds of spaces, then a block of scrambled JavaScript. Git showed nothing. Same author, same date, same message.

Weeks after I first found it, it was back in 35 of my 53 repos. Cleaning that by hand without losing real work took a whole day. forkguard is the tool I wish I had on the first day.

## Writing

- [Malware Hid in My Old Repos and Git Never Showed It](https://blog.prodhosh.me/blog/malware-hid-in-my-old-repos-polinrider), October 23, 2026. How I found it, and how to check yours.
- [How to Check Any Repo for Hidden Malware Before You Run It](https://blog.prodhosh.me/blog/how-to-use-forkguard-check-any-repo-for-hidden-malware), November 7, 2026. A step-by-step guide.

## Roadmap

Planned, with no dates. The command line comes first, and these are built on the same rules.

| Idea | What it would do |
| --- | --- |
| GitHub App | Connect your repos once. It scans every push and opens a fix as a pull request. It never writes to your default branch. |
| VS Code extension | Warns you before you click “Trust” on a cloned folder, which is where this malware strikes. |
| Web checker | Paste a GitHub link, or pick a local folder and press run. It stays in your browser, and nothing is edited without asking. |
| MCP server | Lets an AI agent call forkguard as a tool instead of reading rules. |

## Contributing

- Found something it misses? [Tell us what it looked like](https://github.com/PRODHOSH/forkguard/issues/new?template=missed-malware.yml), without pasting the malicious code.
- Got a false alarm? [Report it](https://github.com/PRODHOSH/forkguard/issues/new?template=false-alarm.yml).
- Want to help build it? Read [CONTRIBUTING.md](https://github.com/PRODHOSH/forkguard/blob/main/CONTRIBUTING.md).

```bash
git clone https://github.com/PRODHOSH/forkguard
cd forkguard
npm test
```

To change this documentation, edit the pages in `tools/docs/pages/` and run `node tools/build-docs.mjs`.

## License and credits

- forkguard is [MIT licensed](https://github.com/PRODHOSH/forkguard/blob/main/LICENSE). Use it, change it, share it.
- This site is set in Manrope and JetBrains Mono. The wordmark is Bricolage Grotesque, converted to outlines. All three are under the SIL Open Font License 1.1.

## Where to next

- [Install](https://forkguard.pages.dev/install/): Get forkguard.
- [Every rule](https://forkguard.pages.dev/reference/rules/): What it catches.
- [Troubleshooting](https://forkguard.pages.dev/guides/troubleshooting/): Something wrong?
