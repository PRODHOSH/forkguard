# Contributing to forkguard

Thanks for helping. Every new rule makes the next developer a little safer.

## Reporting a new trick

Open an issue and describe what you saw:

- which file it was in and what the file was called
- what looked wrong, for example "a long run of spaces after the last line"
- how it got in, if you know

Please do not paste the actual malicious code. Describe its shape instead, or share only the first few characters.

## Reporting a false alarm

If forkguard flags something that is fine, open an issue with the file name and the message it printed. If the project is public, a link helps a lot.

## Sending a pull request

1. Fork the repo and create a branch.
2. Make your change. Keep it simple and keep zero dependencies.
3. Add a test in `test/forkguard.test.js`. Build fake payloads from harmless text at runtime, like the existing tests do, so antivirus does not delete the test files.
4. Run `npm test` and make sure everything passes.
5. Open the pull request and explain what it catches or fixes.

## Ground rules

- No dependencies. forkguard runs before `npm install`, so it must not need one.
- forkguard never runs code from the project it checks.
- Plain, friendly wording in everything a user sees.

## Security issues in forkguard itself

Please email hello@prodhosh.me instead of opening a public issue.
