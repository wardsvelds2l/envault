## Summary

<!-- One or two sentences. -->

## What changed

<!-- Brief description of the change, motivation, and any user-visible
     behaviour differences. -->

## Checklist

- [ ] Tests added or updated (`npm test`)
- [ ] **A crypto round-trip test is included** if this PR touches `src/crypto.ts`, `src/kdf.ts`, `src/vault.ts`, or the AAD / nonce / subkey derivation
- [ ] Lint passes (`npm run lint`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Full quality gate passes (`npm run all`)
- [ ] If this PR changes cryptographic behaviour, the [threat model](https://github.com/wardsvelds2l/envault/blob/main/examples/threat-model.md) and the README's "What envault protects against / does NOT protect against" sections are updated in the same PR
- [ ] Documentation updated (README, `--help` text, JSDoc, examples/)
- [ ] Conventional Commit message (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, …)
- [ ] DCO sign-off (`git commit -s` — see CONTRIBUTING.md)
- [ ] No unrelated changes included
- [ ] I have read [CONTRIBUTING.md](./CONTRIBUTING.md)

## Breaking changes

<!-- If this PR introduces a breaking change, describe it here and
     call it out in the commit message with `!` or a `BREAKING CHANGE:`
     footer. Otherwise, write "None". -->

## Linked issues

<!-- `Fixes #123`, `Closes #456`, or `Refs #789` -->
