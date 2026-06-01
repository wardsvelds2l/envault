# envault

> Encrypted `.env` files you can safely commit to git. XChaCha20-Poly1305 + Argon2id. No SaaS, no account, single binary.

[![CI](https://github.com/wardsvelds2l/envault/actions/workflows/ci.yml/badge.svg)](https://github.com/wardsvelds2l/envault/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/envault.svg)](https://www.npmjs.com/package/envault)
[![npm downloads](https://img.shields.io/npm/dm/envault.svg)](https://www.npmjs.com/package/envault)
[![codecov](https://codecov.io/gh/wardsvelds2l/envault/branch/main/graph/badge.svg)](https://codecov.io/gh/wardsvelds2l/envault)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18.18-brightgreen.svg)](./package.json)
[![no telemetry](https://img.shields.io/badge/telemetry-none-blue.svg)](./SECURITY.md)

---

## Why

Your app has secrets. You want to share them across machines, sync to your team, use them in CI, and keep history in git. **Committing plaintext `.env` is a leak waiting to happen**: one accidental push to a public mirror, one stolen laptop backup, one ex-contractor with repo read access.

`envault` encrypts your `.env` file with a master password and writes the ciphertext to `.env.vault`. Commit that file to git. Every developer and every CI job decrypts it locally with the same master password.

- **No SaaS.** Nothing leaves your machine or your CI runner.
- **No account.** No sign-up, no API key to manage.
- **No telemetry.** Zero network calls in any command. Read the source.
- **Single file.** One `dist/envault.js` bundle. No `node_modules` at runtime.
- **One master password.** Not a recipient list, not per-secret KMS keys, not a public-key directory.

## 30-second demo

```bash
$ cd my-project
$ envault init
Created vault: .env.vault

WARNING: The master password cannot be recovered.
Store it in a password manager (e.g. 1Password, Bitwarden, KeePass).

Next steps:
  envault add KEY=VALUE
  git add .env.vault && git commit -m "Add encrypted env"

$ envault add DATABASE_URL=postgres://user:pass@db.example.com:5432/myapp_prod
Added DATABASE_URL
$ envault add API_KEY=sk_REDACTED --comment "Stripe live key"
Added API_KEY
$ envault add FLASK_ENV=production
Added FLASK_ENV

$ cat .env.vault
{
  "version": 1,
  "kdf": {
    "algorithm": "argon2id",
    "memory": 65536,
    "iterations": 3,
    "parallelism": 1,
    "salt": "xq9TRUDJUOX/SE+XJA8guQ=="
  },
  "vars": {
    "DATABASE_URL": {
      "nonce": "OviwfeiqYbzBken7qMvQffzGM/V/v7Bg",
      "ciphertext": "bsmc6NLzyt67arKF2CB5uJ7aSOQThrMbqhmCUQpsZADIAzt8r2iUxHHf4rWGlVPn5Vc46vrchVHSlSYg38o2Mwxg+g=="
    },
    "API_KEY": {
      "nonce": "0Z5qKbxbsiBKAR7TeAyFEr0Zgp/8PHr7",
      "ciphertext": "qMsqIacSlMkCwpbtS2EJl2P+TF9An6yyvEuC0nMRVSVYgBsB3WtXbF51VUh9H1ul",
      "comment": "Stripe live key"
    },
    "FLASK_ENV": {
      "nonce": "BzRZ8idfFwl0dsFtYZyqPIYK1lgGBTxW",
      "ciphertext": "Gh48oXELJBiHjO8Ixc2KVkontUVGYtylygU="
    }
  }
}

$ git add .env.vault
$ git commit -m "feat: add encrypted env"

$ envault get DATABASE_URL
postgres://user:pass@db.example.com:5432/myapp_prod$   # no trailing newline
$ envault run -- sh -c 'echo $DATABASE_URL'
postgres://user:pass@db.example.com:5432/myapp_prod
$ envault run -- node -e 'console.log("FLASK_ENV =", process.env.FLASK_ENV)'
FLASK_ENV = production
```

The vault file is the only artefact that travels with the repository. An attacker who reads the repo without the master password sees only the KDF salt, the nonces, and the ciphertext.

## Threat model

This is the short version. The full STRIDE-shaped document — assets, adversaries, attack vectors, mitigations, residual risks, and the line-by-line cryptographic construction — lives in [`examples/threat-model.md`](./examples/threat-model.md). **Read it before adopting `envault` for a new project.**

### What `envault` protects against

- **Git history leakage.** Public repo, leaked backup, stolen GitHub token — the secrets stay encrypted.
- **Stolen laptops and backups.** The vault is useless without the master password.
- **Casual insiders with repo read access.** They can see the file but cannot decrypt it.
- **Tampered ciphertext.** Poly1305's 128-bit auth tag catches any modification; the variable name is part of the AAD, so swapping `API_KEY`'s ciphertext for `DATABASE_URL`'s fails to verify.
- **Nonce reuse.** Nonces are 24 random bytes per encrypt — collision is ≈ 2⁻⁹⁶ in a 1M-entry vault.
- **Per-value sloppy rotation.** Re-`add` one variable; the rest of the vault is untouched.

### What `envault` does NOT protect against

This list is load-bearing. **If your threat includes any of these, `envault` is not the right tool for that part of your system.**

- **Master password compromise.** Anyone with the password has full access. Choose ≥ 20 random characters or a 4–6 word diceware passphrase and store it in a password manager. Never reuse it.
- **Runtime memory dumps.** A debugger, `ptrace`, or `/proc/<pid>/mem` read of a running `envault run` process exposes the decrypted values.
- **Process listing.** A co-located process can read another process's environment via `/proc/<pid>/environ` on Linux.
- **Malicious dependencies in the user's project.** A backdoored npm package can read `process.env` once `envault run` has decrypted the vault and exfiltrate it. This is true of every secret-injection scheme that ultimately relies on environment variables. Pin your deps, run `npm ci`, and use a tool like [`cve-watch`](https://github.com/wardsvelds2l/cve-watch) in CI.
- **Compromised developer machine or build host.** Root-access malware captures the master password at prompt time and the vault at rest.
- **No audit log.** `envault` does not record who decrypted what and when. The audit trail is git history (every modification to `.env.vault` is a commit with author + timestamp).
- **No key wrapping.** The master password is the only key. Losing it means losing the secrets. There is no recovery path, by design.

### Compromise model

| Who | Capability | Outcome |
| --- | --- | --- |
| Repo read access only | Sees `.env.vault` | Cannot decrypt without the master password. |
| Repo read access + master password | Decrypts everything | **Total compromise.** Rotate the master password (see [`examples/rotate-after-compromise.md`](./examples/rotate-after-compromise.md)) and every value in the vault. |
| Repo write access only, no master password | Flips bits in ciphertext | Decryption fails — Poly1305 auth tag mismatch. `envault` exits non-zero. |
| Local root on dev box or CI runner | Reads process memory, keystroke log, FS | **Total compromise.** This is a build-host problem, not a `envault` problem. |

### Crypto choices and why

| Choice | What it does | Why this one |
| --- | --- | --- |
| **XChaCha20-Poly1305** (IETF RFC 8439) | AEAD: encrypts + authenticates with one 256-bit key | 192-bit nonce means random nonces are safe; no per-message counter to keep state. Poly1305 catches tampering. Implemented in audited TypeScript via `@noble/ciphers`. |
| **Argon2id** (RFC 9106) | Password-based KDF | OWASP 2024 baseline. Resistant to GPU and side-channel attacks. `m = 64 MiB, t = 3, p = 1` matches the OWASP "interactive" parameter set and takes ≈ 1.5 s on a 2024-era laptop. |
| **Per-variable subkeys** | `HMAC-SHA256(masterKey, "envault:v1:" + VAR_NAME)` | A leaked ciphertext for one variable does not enable an offline attack on the master key. The `envault:v1:` domain separator prevents subkey reuse across format versions. |
| **Variable name in the AAD** | Auth tag covers `VAR_NAME` | An attacker cannot swap the ciphertext of `API_KEY` with that of `DATABASE_URL`. The auth tag will not verify. |
| **Random 24-byte nonces** | One nonce per `encryptValue` call | No counter state, no rollover, no cross-vault coordination. Collision probability at 1M entries is ≈ 2⁻⁹⁶. |

The full line-by-line construction is in [`examples/threat-model.md` § 5](./examples/threat-model.md).

## Comparison to alternatives (honest)

| Tool | Encryption | Storage | Per-value decrypt | Multi-user | Offline | Free | Format | Master key |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **envault** | XChaCha20-Poly1305 + Argon2id | JSON file in git | Yes (one value, no leak of others) | Single password | Yes | Yes | `.env.vault` | One master password |
| [`dotenv-vault`](https://dotenv.org/docs/vault) | AES-256-GCM | Cloud (paid SaaS) | Yes | Built-in roles | No | No (paid tiers) | Encrypted blobs in cloud | Per-user keys, server-mediated |
| [`sops`](https://github.com/getsops/sops) | Multiple (PGP, KMS, age, …) | YAML/JSON in git | Yes, with KMS | Recipient list | Yes (without KMS) | Yes | YAML/JSON | Asymmetric or KMS |
| [`git-crypt`](https://github.com/AGWA/git-crypt) | AES-256-CBC | Whole repo | No — all-or-nothing | GPG key list | Yes | Yes | Transparent filter | Per-recipient symmetric keys |
| [`age`](https://github.com/FiloSottile/age) | X25519 + ChaCha20-Poly1305 | Binary file | Manual — you decrypt the whole blob | Recipient list | Yes | Yes | Binary `age` files | Per-recipient X25519 keys |

**vs `dotenv-vault`** — `envault` is fully local and offline. No account, no SaaS dependency, no pricing surprise, no server you have to trust with your master key. `dotenv-vault` gives you per-user RBAC at the cost of a hosted control plane and a monthly bill.

**vs `sops`** — `envault` is purpose-built for `.env` files. No YAML, no KMS requirement, no per-secret KMS key. One master password. If you need multi-party KMS-based unsealing, use `sops`; if you need a single human-memorable password for a `.env`, use `envault`.

**vs `git-crypt`** — `envault` encrypts per-variable with per-variable subkeys, so you can decrypt one value without decrypting the world. `git-crypt` is all-or-nothing for the whole repository, which means `git checkout` of the working tree either decrypts the whole repo or doesn't.

**vs `age`** — `envault` uses a human-memorable password instead of a public-key recipient list. Better for solo devs and small teams. `age` requires per-recipient key management and decryption of the whole blob.

## Installation

```bash
npm install -g envault
```

Or run it without installing:

```bash
npx envault@^0.2.0 init
```

Or grab the prebuilt single-file bundle from the [releases page](https://github.com/wardsvelds2l/envault/releases) — `dist/envault.js` is one self-contained file, no `node_modules` needed at runtime.

Requires Node.js 18.18 or newer (we test 18, 20 and 22 in CI on Ubuntu, macOS, and Windows).

## Quick start

```bash
cd my-project
echo ".env" >> .gitignore
envault init
envault add DATABASE_URL=postgres://user:pass@host/db
envault add API_KEY=sk-abc123 --comment "Stripe API key"
envault add 'URL=https://example.com/?q=1&r=2'   # values with = must be quoted
git add .env.vault .gitignore
git commit -m "Add encrypted env"
```

To use the values at runtime:

```bash
envault get DATABASE_URL                # prints the value, no trailing newline
envault run -- node server.js           # runs with all vars in env
envault run -- npm start                # same, for any command
envault unlock                          # writes a plaintext .env you can source
```

For CI, see [`examples/github-actions.yml`](./examples/github-actions.yml) and [`examples/gitlab-ci.yml`](./examples/gitlab-ci.yml).

## Command reference

### Global options (apply to every subcommand)

| Option | Description |
| --- | --- |
| `--vault <path>` | Path to the vault file. Default: `.env.vault`. |
| `--password-stdin` | Read the master password from stdin (trailing newline stripped). |
| `--password-file <path>` | Read the master password from a file. |
| `--no-password-prompt` | Never prompt interactively. Useful in CI — fail loudly if no other source is set. |

**Password source priority** (first non-empty wins):

1. `--password-file <path>`
2. `--password-stdin`
3. `ENVVAULT_PASSWORD` environment variable
4. Interactive prompt (requires a TTY)

### `envault init`

Create an empty vault. Prints a warning about the master password. Refuses to overwrite an existing vault.

```bash
envault init
envault init --vault secrets.vault
```

### `envault add KEY=VALUE [--comment "..."]`

Encrypt a single variable and add or update it in the vault.

```bash
envault add DATABASE_URL=postgres://...
envault add API_KEY=sk-abc123 --comment "Stripe"
envault add 'URL=https://example.com/?q=1&r=2'
```

Only the first `=` separates key from value. For values containing spaces, quote the whole argument.

### `envault set`

Interactive REPL. Reads `KEY=VALUE` entries from stdin, one per line. End with `^D`. Comments (`#`) and blank lines are ignored.

```bash
envault set <<'EOF'
DATABASE_URL=postgres://...
API_KEY=sk-abc123
EOF
```

### `envault lock [--from .env] [--to .env.vault]`

Read a plaintext `.env` file, encrypt every variable, write the result to the vault. If the vault already exists, its KDF parameters and salt are preserved.

```bash
envault lock                  # reads .env, writes .env.vault
envault lock --from prod.env --to secrets/prod.vault
```

### `envault unlock [--from .env.vault] [--to .env]`

Decrypt the vault and write a plaintext `.env` file. Plaintext files are written with mode `0600`.

```bash
envault unlock                # writes .env from .env.vault
envault unlock --to .env.production
```

### `envault get KEY`

Print a single value to stdout, **no trailing newline**. CI-friendly: `export $(envault get FOO | xargs)` works correctly. Exit `0` on success, non-zero on missing key or wrong password.

### `envault run -- cmd arg1 arg2`

Decrypt all variables, set them as the child process's environment, exec the command. Exits with the child's exit code. Decrypted vars override parent env vars of the same name; other parent env vars (like `PATH`) are inherited.

```bash
envault run -- npm start
envault run -- python manage.py migrate
envault run -- ./scripts/deploy.sh production
```

The plaintext values exist only in the child process's environment — they are never written to disk in `.env` form.

### `envault rotate`

Re-encrypt the vault with a new master password. The old password is required to decrypt; the new password is entered interactively (with confirmation) and must be different from the old.

```bash
envault rotate
```

Requires an interactive TTY. For non-interactive rotation, do it manually: `unlock` → re-`lock` with a new password file. See [`examples/rotate-after-compromise.md`](./examples/rotate-after-compromise.md) for a full incident-response runbook.

### `envault inspect`

Show vault metadata only — no values. Useful for sanity checks and audits.

```text
Vault: .env.vault
Version: 1
Modified: 2026-06-01T20:45:10.299Z
Size: 834 bytes
KDF:
  Algorithm: argon2id
  Memory: 65536 KiB
  Iterations: 3
  Parallelism: 1
Variables: 4
  - API_KEY  # Stripe live key
  - DATABASE_URL
  - FLASK_ENV
  - FOO
```

## File format

`.env.vault` is a single JSON file. It is stable; future versions will be backwards-compatible.

```json
{
  "version": 1,
  "kdf": {
    "algorithm": "argon2id",
    "memory": 65536,
    "iterations": 3,
    "parallelism": 1,
    "salt": "<base64, 16 random bytes generated on init>"
  },
  "vars": {
    "DATABASE_URL": {
      "nonce": "<base64, 24 bytes (XChaCha20-Poly1305 nonce)>",
      "ciphertext": "<base64, variable-length ciphertext + 16-byte Poly1305 auth tag>",
      "comment": "optional human-readable comment"
    }
  }
}
```

### Cryptographic construction

1. **Master key**: `masterKey = Argon2id(password, salt, t=3, m=64MiB, p=1, dkLen=32)`.
2. **Per-variable subkey**: `subkey = HMAC-SHA256(masterKey, "envault:v1:" + VAR_NAME)`.
3. **Encryption**: `ciphertext = XChaCha20-Poly1305.encrypt(subkey, nonce, plaintext, AAD=VAR_NAME)`.
4. **Decryption**: `plaintext = XChaCha20-Poly1305.decrypt(subkey, nonce, ciphertext, AAD=VAR_NAME)`.

The variable name is part of the **additional authenticated data (AAD)**, so an attacker cannot swap the ciphertext of `DATABASE_URL` with that of `API_KEY` — the auth tag will not verify.

A unique 24-byte nonce is generated for every `encrypt` call using a cryptographically secure RNG. Nonces are public (stored in the vault) and never reused because they are random.

The full rationale and OWASP-2024-aligned parameters are in [`examples/threat-model.md`](./examples/threat-model.md).

## CI integration

### GitHub Actions

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: npm ci
- run: npm install --no-save envault@^0.2.0
- name: Run tests with decrypted vault
  env:
    ENVVAULT_PASSWORD: ${{ secrets.ENVVAULT_PASSWORD }}
  run: npx envault run -- npm test
```

A copy-paste-ready version with the full matrix and safety commentary is in [`examples/github-actions.yml`](./examples/github-actions.yml).

### GitLab CI

```yaml
test:
  image: node:20
  before_script:
    - npm ci
    - npm install --no-save envault@^0.2.0
  script:
    - npx envault inspect
    - npx envault run -- npm test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_PIPELINE_BRANCH == $CI_DEFAULT_BRANCH
```

A copy-paste-ready version with a Node matrix and a full safety commentary is in [`examples/gitlab-ci.yml`](./examples/gitlab-ci.yml).

For a project that deploys to multiple environments with different secrets, see [`examples/multi-env.sh`](./examples/multi-env.sh) — it bootstraps separate `dev`, `staging`, and `production` vaults so that a leaked dev password doesn't read production.

## Performance

Benchmarked on 2026-06-01 with `npm run bench` on:

- **Host:** AMD Ryzen 9 9900X 12-Core Processor
- **Node:** v22.22.0
- **OS:** Linux x64
- **KDF:** Argon2id, m=64 MiB, t=3, p=1 (OWASP 2024 baseline)
- **Cipher:** XChaCha20-Poly1305 via `@noble/ciphers`
- **Runs per size:** 3, median reported

| Variables | Argon2id KDF | Lock (parse + encrypt) | Unlock (decrypt all) | Per-var decrypt |
| ---: | ---: | ---: | ---: | ---: |
| 10   | 1.60 s | 1.61 s | 1.57 s | 81.4 µs |
| 100  | 1.56 s | 1.58 s | 1.59 s | 28.2 µs |
| 1000 | 1.54 s | 1.55 s | 1.56 s | 12.6 µs |

Sanity: `parseEnv()` of 1000 entries: 0.2 ms (avg of 50 runs).

**What this means in practice:** the Argon2id KDF is the entire cost of `unlock`. Per-variable decrypt is microseconds and scales linearly — at 1000 variables the per-var cost is 12.6 µs, so the KDF is ≈ 100,000× the cost of the actual crypto. There is no path to making `unlock` faster without weakening the KDF, and the KDF is the part that protects you against a stolen vault file. The `lock` and `unlock` times above are dominated by KDF and are essentially identical, which is the expected outcome.

Reproduce locally with `npm run bench`. The numbers will be faster or slower depending on the host CPU and memory bandwidth; the relative ratio of `lock` to `unlock` should remain roughly stable.

## Limitations

- **Not designed for binary secrets** (certificates, PEM keys). Base64-encode them first and store the base64 string as the value.
- **No multi-user access control.** Anyone with the master password has full read/write access to every secret. Use per-environment vaults (see `examples/multi-env.sh`) to limit blast radius.
- **No audit log.** You cannot see who decrypted what and when. The audit trail is git history.
- **No key wrapping.** The master password is the only key. Losing it means losing the secrets. There is no recovery path, by design.
- **No built-in secret scanning.** Pair `envault` with [`gitleaks`](https://github.com/gitleaks/gitleaks) or [`cve-watch`](https://github.com/wardsvelds2l/cve-watch) in CI to catch accidental plaintext secrets in code.

## Roadmap

- `envault recipients add <pubkey>` / `envault recipients rm <pubkey>` — wrap the master key for an additional recipient (solves the "give a contractor dev-only access" use case)
- `envault recipients threshold <M-of-N>` — Shamir-style splitting for the wrapped master key
- Hardware-token support (FIDO2 / YubiKey) for an additional unwrap factor
- Optional `ENVVAULT_PASSWORD_FILE` env-var shortcut to match `--password-file`
- Pluggable KDFs so power users can swap Argon2id for scrypt on platforms where native bindings matter

None of these are required to use `envault` today. They are listed to set expectations, not as promises.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Short version: `npm install`, then `npm run all` (typecheck → lint → test → build → bundle). All 111 tests must pass locally and on CI.

If your PR touches `src/crypto.ts`, `src/kdf.ts`, `src/vault.ts`, or the AAD / nonce / subkey derivation, it is a **crypto PR** and must come with a threat-model update in the same PR. The full list of requirements is in [`CONTRIBUTING.md` § "Crypto changes"](./CONTRIBUTING.md#crypto-changes).

## Security

**Do not file public issues for security problems.** Use [GitHub Security Advisories](https://github.com/wardsvelds2l/envault/security/advisories/new) — the maintainer is paged automatically. Full policy: [`SECURITY.md`](./SECURITY.md). SLA: 24-hour acknowledgement, 90-day coordinated disclosure (7 days for critical bypasses).

## License

[MIT](./LICENSE).
