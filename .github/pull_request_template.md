## What this changes

<!-- One or two lines. What does forkguard catch, fix or do differently now? -->

## Why

<!-- Link the issue if there is one, like "Closes #12". -->

## Checklist

- [ ] `npm test` passes
- [ ] Added or updated a test
- [ ] Still zero dependencies
- [ ] `node bin/forkguard.js .` still says the repo looks clean
- [ ] Docs updated, and `npm run docs` run, if what a user sees changed
- [ ] If this touches `src/skills`, the SkillSpector credit in the file header and `NOTICE` is intact
- [ ] No real malware in the diff (fake payloads are built from harmless text at runtime)
