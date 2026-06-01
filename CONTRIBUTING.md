# Contributing to envault

Thanks for taking the time to contribute. `envault` is a small project,
so the goal of this document is to make it easy for you to get set up,
run the tests, and send a focused pull request that we can merge
quickly.

`envault` is also a **crypto tool**. Changes to the cipher suite, the
KDF, the AAD binding, the nonce generation, or the on-disk format are
security-sensitive. The bar for review of such changes is high, and
they are **expected to come with a threat-model update in the same
PR** (see "Crypto changes" below).

## Code of Conduct

By participating, you agree to abide by the
[Contributor Covenant](./CODE_OF_CONDUCT.md) (v2.1). Be kind. Be
specific. Disagree on the substance, not on the person.

## Development setup

You need **Node.js 20.0 or newer** (we test 20 and 22 in CI),
`npm` 9+, and a POSIX-y shell. On Windows the bin wrapper is
intentionally a `.cmd`-less shim that re-execs `node
dist/envault.js`; we still test on `windows-latest` in CI.

```bash
git clone https://github.com/wardsvelds2l/envault
cd envault
npm install
```

To run the tool locally:

```bash
npm run bundle
./bin/envault --help           # POSIX
node bin/../dist/envault.js --help  # any platform
```

## Quality gate

Every PR must pass `npm run all`, which runs the checks below in
sequence. Local green == CI green.

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint on src + tests + scripts
npm test            # vitest run (111 tests, ~35s on first run because of Argon2id)
npm run build       # tsc emit to dist/
npm run bundle      # ncc single-file build
```

Coverage is collected on Node 20 with `npm run test:coverage` and
uploaded to Codecov. We aim for **≥ 80%** statements / lines and
**≥ 70%** branches on `src/`.

## Code style

We use **TypeScript strict mode** (ESM, `moduleResolution: bundler`),
**ESLint** with `@typescript-eslint/recommended`, and **Prettier** with
the project defaults (2-space, single quotes, semicolons, 100 cols,
LF). Run:

```bash
npm run lint
npm run format
```

before pushing. There is no separate style discussion — Prettier
decides. A few house rules that aren't covered by tooling:

- **No `any`** unless you are wrapping an untyped third-party API and
  have left a comment explaining why. Prefer `unknown` + narrowing.
- **Errors are values, not throws**, in command logic. Reserve
  `throw` for genuinely impossible states; return early with a
  user-facing error message in `run*` functions.
- **No new runtime dependencies** without prior discussion. The binary
  stays single-file and small. The current runtime deps are exactly
  `@noble/ciphers`, `@noble/hashes`, and `commander` and we want to
  keep it that way.

## Crypto changes

If your PR touches any of the following, treat it as a security PR:

- The cipher (`src/crypto.ts`) — algorithm choice, nonce generation,
  AAD construction, subkey derivation.
- The KDF (`src/kdf.ts`) — Argon2id parameters, salt length, password
  handling.
- The on-disk format (`src/vault.ts`) — schema validation, mode flag
  for future versions.
- The `getPassword()` plumbing (`src/password.ts`) — the order of
  sources, the TTY detection, the env-var name.

In addition to the regular checklist, a crypto PR **must**:

1. Add or update a crypto round-trip test (encrypt, tamper, decrypt,
   expect auth-tag failure). See `__tests__/crypto.test.ts` for the
   existing pattern.
2. Update [`examples/threat-model.md`](./examples/threat-model.md) to
   reflect the new construction, and the "What envault protects
   against / does NOT protect against" sections of `README.md`.
3. Mention the change in the PR description with a "Threat model
   impact" paragraph: which attacks become harder, which become
   easier, and what is unchanged.

## Testing

Tests live in `__tests__/` and mirror the source tree:

- `__tests__/*.test.ts` for top-level modules (`crypto`, `envfile`,
  `kdf`, `vault`).
- `__tests__/commands/*.test.ts` for each `src/commands/*.ts`.

When you add a flag, behaviour, or parser edge case, **add a test
first**, then implement. Use the existing fixtures in `__tests__/`
rather than reaching for the network. Argon2id is intentionally slow
(≈1.6 s per derivation with the default parameters); keep that in
mind when writing tests and prefer to re-use a single derived key
where possible.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<body explaining the why, not the what>

<footer with refs>
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`,
`chore`, `ci`, `build`. Breaking changes use `!` after the type/scope
and a `BREAKING CHANGE:` footer.

The release pipeline (`.github/workflows/release-please.yml`) reads
these to build the changelog and bump the version automatically.

## Sign-off (DCO)

We use a lightweight [Developer Certificate of Origin](https://developercertificate.org/).
Add a `Signed-off-by:` line to your commit message:

```text
feat(get): add --quiet flag

Useful for CI logs that pollute Slack notifications.

Signed-off-by: Jane Developer <jane@example.com>
```

You can generate this automatically with `git commit -s`. By
signing off you assert that you wrote the code (or have the right to
submit it under the project's MIT license). A full CLA is **not**
required.

## Pull request process

1. Fork the repo, create a topic branch, push.
2. Make sure `npm run all` is green locally.
3. Open a PR against `main` and fill in the
   [pull request template](./.github/PULL_REQUEST_TEMPLATE.md).
4. A maintainer will review within a few days. Expect at least one
   round of comments; small PRs get reviewed faster.
5. Squash-merge is the default; the merge commit message becomes the
   changelog entry, so make it good.

## Good first issues

Issues labelled [`good first issue`](https://github.com/wardsvelds2l/envault/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are scoped to be approachable in a few hours. If you are looking for a
way in, start there. **Note:** even "good first issue" PRs touching
crypto require a threat-model update.

## Reporting security issues

See [SECURITY.md](./SECURITY.md). **Do not** open a public GitHub
issue for a security problem. SLA: 24-hour acknowledgement, 90-day
coordinated disclosure.

## License

By contributing, you agree that your contributions will be licensed
under the project's [MIT license](./LICENSE).
