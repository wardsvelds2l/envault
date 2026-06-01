# envault

[![CI](https://github.com/anomalyco/envault/actions/workflows/ci.yml/badge.svg)](https://github.com/anomalyco/envault/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)
[![npm](https://img.shields.io/npm/v/envault)](https://www.npmjs.com/package/envault)

Encrypt your `.env` files with modern authenticated encryption so they can be safely committed to git.

## The problem

Your application has secrets — API keys, database URLs, signing keys, OAuth client secrets. You want to:

- Share them across multiple machines
- Sync them to your team
- Use them in CI
- Keep history in git

**The wrong solution**: committing plaintext `.env` to git. The file is small, it's "just dev secrets", and nobody will ever leak the repo… right? It only takes one accidental push to a public mirror, one stolen backup, or one curious ex-contractor.

**envault's solution**: encrypt the `.env` file with a master password, commit the encrypted `.env.vault` to git. Every developer and CI run decrypts locally with the master password.

## Comparison to alternatives

| Tool | Encryption | Storage | Per-value decrypt | Offline | Free | Format |
|---|---|---|---|---|---|---|
| **envault** | XChaCha20-Poly1305 + Argon2id | JSON in git | Yes | Yes | Yes | `.env.vault` |
| `dotenv-vault` | AES-256-GCM | Cloud (paid) | Yes | No | No | encrypted blobs in cloud |
| `sops` | Multiple backends | YAML/JSON in git | With KMS | Yes | Yes | YAML/JSON |
| `age` | X25519 + ChaCha20 | Binary file | Manual | Yes | Yes | binary age files |
| `git-crypt` | AES-256-CBC | Whole repo | No (all-or-nothing) | Yes | Yes | transparent filter |

**vs `dotenv-vault`**: envault is fully local and offline. No account, no SaaS dependency, no pricing surprises.

**vs `sops`**: envault is purpose-built for `.env` files. No YAML, no KMS requirement, no per-secret KMS key management. Just one master password.

**vs `age`**: envault uses a human-memorable password instead of a public-key recipient list. Better for solo devs and small teams. Age requires per-recipient key management.

**vs `git-crypt`**: envault encrypts per-variable with per-variable subkeys, so you can decrypt one value without decrypting the world. `git-crypt` is all-or-nothing for the whole repo.

## Installation

```bash
npm install -g envault
```

Or grab a prebuilt single-file binary from the [releases page](https://github.com/anomalyco/envault/releases). The bundle is one self-contained `dist/envault.js` — no `node_modules` needed at runtime.

Requires Node.js 20+.

## Quick start

```bash
cd my-project
envault init
envault add DATABASE_URL=postgres://user:pass@host/db
envault add API_KEY=sk-abc123 --comment "Stripe API key"
git add .env.vault
git commit -m "Add encrypted env"
```

To use the values:

```bash
envault get DATABASE_URL          # prints the value, no trailing newline
envault run -- node server.js     # runs with all vars in env
envault unlock                    # writes a .env file you can source
```

## Command reference

### Global options

Available on every subcommand:

| Option | Description |
|---|---|
| `--vault <path>` | Path to vault file (default: `.env.vault`) |
| `--password-stdin` | Read the master password from stdin (stripped of trailing newline) |
| `--password-file <path>` | Read the master password from a file |
| `--no-password-prompt` | Never prompt interactively. Useful in CI: fail loudly if no other source is set. |

Password source priority: `--password-file` > `--password-stdin` > `ENVVAULT_PASSWORD` env var > interactive prompt (requires TTY).

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

The value can contain `=` characters (only the first `=` separates key and value). For values with spaces, quote the whole argument.

### `envault set`

Interactive REPL. Reads `KEY=VALUE` entries from stdin, one per line. End with `^D`.

```bash
envault set <<'EOF'
DATABASE_URL=postgres://...
API_KEY=sk-abc123
EOF
```

Comments (`#`) and blank lines are ignored. Used by the `set` REPL in the same way as the `.env` format.

### `envault lock [--from .env] [--to .env.vault]`

Read a plaintext `.env` file, encrypt every variable, and write the result to the vault. If the vault already exists, its KDF parameters and salt are preserved (so subsequent locks use the same master key).

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

Print a single value to stdout, with **no trailing newline**. CI-friendly: `export $(envault get FOO | xargs)` works correctly.

Exit codes: `0` on success, non-zero on missing key or wrong password.

### `envault run -- cmd arg1 arg2`

Decrypt all variables, set them as the child process's environment, and exec the command. Exits with the child's exit code. Decrypted vars override parent env vars of the same name; other parent env vars (like `PATH`) are inherited.

```bash
envault run -- npm start
envault run -- python manage.py migrate
envault run -- ./scripts/deploy.sh production
```

### `envault rotate`

Re-encrypt the vault with a new master password. The old password is required to decrypt; the new password is entered interactively (with confirmation) and must be different from the old.

```bash
envault rotate
```

Requires an interactive TTY for the new password. If you need non-interactive rotation, do it manually: `unlock` → re-`lock` with a new password file.

### `envault inspect`

Show vault metadata only — no values. Useful for sanity checks and audits.

```bash
envault inspect
```

```
Vault: .env.vault
Version: 1
Modified: 2025-01-15T10:23:00.000Z
Size: 1423 bytes
KDF:
  Algorithm: argon2id
  Memory: 65536 KiB
  Iterations: 3
  Parallelism: 1
Variables: 12
  - API_KEY  # Stripe
  - DATABASE_URL
  - SECRET_TOKEN
  ...
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
      "ciphertext": "<base64, variable-length ciphertext + 16-byte auth tag>",
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

## Threat model

### What envault protects against

- **Git history leakage**: even if your repository is public or your git host is compromised, the secrets stay encrypted.
- **Stolen backups and laptops**: the `.env.vault` file is useless without the master password.
- **Casual insiders**: team members with repository read access cannot read secrets without the master password.
- **Single-secret leak from sloppy rotation**: with per-variable subkeys, a leak of one variable's ciphertext does not directly enable decrypting another.

### What envault does NOT protect against

- **Master password compromise**: anyone with the master password has full access to every secret. Choose a strong password and store it in a password manager.
- **Runtime memory dumps**: a debugger, ptrace, or `/proc/<pid>/mem` read of a running process exposes decrypted values in memory.
- **Process listing**: another process on the same machine can read another process's environment via `/proc/<pid>/environ` on Linux.
- **Malicious dependencies**: a supply chain attack (a backdoored `npm` dependency) can read the decrypted env at runtime and exfiltrate it.
- **Compromised developer machine**: if your laptop has malware with root access, the master password and decrypted values are at risk.
- **Master password reuse**: do not reuse your master password anywhere else. A breach of another service could compromise the vault.

## Security warnings

- **Choose a strong master password** (≥ 20 characters, random, or a 4–6 word diceware passphrase). Store it in a password manager like 1Password, Bitwarden, or KeePass.
- **Never commit the master password.** It should never appear in the repo, in CI logs, or in chat.
- **Rotate the master password immediately** if you suspect compromise. Use `envault rotate` and update the password in every team member's password manager and every CI secret store.
- **Rotate individual values** (re-add them with `envault add`) if a specific value is leaked independently. The vault structure allows per-variable rotation without touching the rest.
- **Use different master passwords for different environments** (e.g. one for staging, one for production). Use `--vault` to point at a different vault file per environment.

## Limitations

- **Not designed for binary secrets** (certificates, PEM keys). Base64-encode them first.
- **No multi-user access control**: anyone with the master password has full read/write access to every secret.
- **No audit log**: you cannot see who decrypted what and when.
- **No key wrapping**: the master password is the only key. Losing it means losing the secrets.
- **No built-in secret scanning**: pair envault with tools like [`gitleaks`](https://github.com/gitleaks/gitleaks) to catch accidental plaintext secrets in code.

## Development

```bash
npm install
npm run all          # lint + typecheck + test + build + bundle
```

Run the locally-bundled binary:

```bash
./bin/envault init
./bin/envault add FOO=bar
./bin/envault get FOO
```

## License

MIT — see [LICENSE](./LICENSE).
