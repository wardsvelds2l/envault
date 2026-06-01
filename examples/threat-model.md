# envault — threat model

This is a working, one-page threat model for `envault`. It is
intentionally STRIDE-shaped but uses the simplest possible vocabulary
— the goal is that an engineer adopting `envault` can read it in five
minutes and understand exactly what is and is not protected.

For every section, think of three actors: the **developer on a
laptop**, the **CI runner**, and an **adversary** who has gained
read-only access to the repository (or a backup of it). The threat
model is symmetric across all three — they all hold the same vault
file and need the same master password to decrypt it.

## 1. Assets

- **Plaintext secrets** stored in `.env` files: API keys, database
  URLs, OAuth client secrets, signing keys, etc.
- **The master password** used to derive the encryption key.
- **The encrypted vault file** (`.env.vault`) committed to git.
- **Decrypted values in process memory** during a `envault run`
  invocation.

## 2. Adversaries we plan for

| Adversary | Capability | Realistic scenario |
| --- | --- | --- |
| **A1 — Casual reader of the repo** | Read access to the git repository (or a leaked backup / public mirror). | Accidental push to a public repo, stolen GitHub token with `repo` read scope. |
| **A2 — Build host snooper** | Read access to the filesystem of a CI runner or developer machine **between** runs. | Compromised CI runner snapshot, unencrypted laptop backup in cloud storage. |
| **A3 — Shoulder surfer** | Brief visual access to a terminal at commit / unlock time. | Pair-programming session, screen sharing. |
| **A4 — Sloppy rotation** | Read access to one old value that is still in use somewhere. | A test API key committed in a blog post. |

## 3. Adversaries we explicitly do **not** plan for

These are out of scope and the README is honest about it. `envault`
cannot protect against them by design.

| Adversary | Why it is out of scope |
| --- | --- |
| **B1 — Master password compromise** | Anyone with the password can decrypt the vault. This is true of any password-based system. |
| **B2 — Runtime memory dump** | A debugger or `/proc/<pid>/mem` read of a running process that has decrypted the vault. |
| **B3 — Process listing** | A co-located process reading `/proc/<pid>/environ` while `envault run` is alive. |
| **B4 — Malicious dependency in the user's project** | A backdoored npm package reads `process.env` and exfiltrates the values. |
| **B5 — Compromised developer machine** | Root-access malware captures the master password at prompt time and the vault at rest. |
| **B6 — Compromised build host** | The CI runner's OS or hypervisor is compromised and reads the master password from process memory while `envault run` is executing. |

## 4. Attack vectors and mitigations

### AV-1: Accidental plaintext commit (`A1`)

- **Vector.** A developer runs `git add .` without an `.gitignore`
  for `.env`.
- **Mitigation.** `envault` does not auto-add files. It only writes
  `.env.vault` to the current directory; the developer is expected
  to add `.env` to `.gitignore` (the README's quick start does not
  enforce this — it is on the user). The recommended follow-up
  workflow is to also run `gitleaks` or `cve-watch` in CI.
- **Residual risk.** None if `.env` is in `.gitignore`. High if it
  is not.

### AV-2: Repo leak, public mirror, or stolen backup (`A1`, `A2`)

- **Vector.** The `.env.vault` file is read by an attacker who has
  the repo but not the master password.
- **Mitigation.** The vault is encrypted with
  XChaCha20-Poly1305 using a key derived from the master password
  via Argon2id. With the recommended parameters
  (m=64 MiB, t=3, p=1) the cost of an offline brute-force attack
  against a strong password is high.
- **Residual risk.** A weak or reused master password makes the
  vault as weak as that password. See the README's "Security
  warnings" section.

### AV-3: Casual insider (`A1`)

- **Vector.** A team member with read access to the repo but no
  need-to-know for a specific production secret (e.g. a contractor).
- **Mitigation.** Same as AV-2. The per-variable subkey derivation
  does **not** help here — anyone with the master password can
  decrypt everything.
- **Residual risk.** If the team has the master password, they have
  everything. Use per-environment vaults (see
  `examples/multi-env.sh`) to limit blast radius.

### AV-4: Tampered ciphertext (`A1`)

- **Vector.** An attacker with write access to the repo (or to a
  backup) flips a byte in a ciphertext block hoping the decrypt
  will still produce "something".
- **Mitigation.** Poly1305's 128-bit authentication tag catches any
  modification of the ciphertext, the nonce, or the AAD. The
  variable name is part of the AAD, so the attacker cannot swap the
  ciphertext of `API_KEY` with that of `DATABASE_URL` — the auth
  tag will not verify.
- **Residual risk.** None, modulo a future break of XChaCha20 or
  Poly1305, which would be a global event and is not a `envault`-
  specific concern.

### AV-5: Nonce reuse (`A1`)

- **Vector.** Two different values are encrypted with the same key
  and the same nonce.
- **Mitigation.** Nonces are 24 random bytes from
  `crypto.getRandomValues` / `randomBytes`. The probability of a
  collision in a vault with 1 000 000 entries is ≈ 2⁻⁹⁶, and
  birthday collisions become non-negligible only at ≈ 2⁹⁶ entries
  per vault. Nonces are stored in the file as part of the
  per-variable record and are **public**.
- **Residual risk.** None at realistic vault sizes. The format
  reserves room for an explicit nonce if the algorithm is ever
  changed.

### AV-6: Sloppy per-value rotation (`A4`)

- **Vector.** A single value is leaked (e.g. posted on a blog).
  The team needs to rotate just that value without rotating the
  master password.
- **Mitigation.** Re-`add` the variable with a new value; the
  existing per-variable record is overwritten with a new
  nonce + ciphertext + subkey. No other variable is affected.
- **Residual risk.** None for the cryptographic part. The
  operational part (revoking the leaked key at the upstream
  service) is not `envault`'s concern.

## 5. Cryptographic construction (what the code actually does)

This is the construction, line by line, so reviewers can map it to
the source.

1. `masterKey = Argon2id(password, salt, t=3, m=64 MiB, p=1, dkLen=32)`
   via `@noble/hashes/argon2`. Salt is 16 random bytes, generated on
   `envault init` and stored in `kdf.salt` (base64).
2. `subkey = HMAC-SHA256(masterKey, "envault:v1:" + varName)` via
   `@noble/hashes/hmac` + `@noble/hashes/sha2`. The version prefix
   `"envault:v1:"` is a domain separator that prevents the same
   subkey from being reused if a future version of `envault`
   introduces a new construction.
3. `ciphertext = XChaCha20-Poly1305.encrypt(subkey, nonce, plaintext, AAD=varName)`.
   Nonce is 24 random bytes per `encryptValue()` call. AAD is the
   variable name as UTF-8 bytes.
4. On decrypt, the same subkey and AAD are reconstructed. Any
   mismatch in the AAD or the auth tag raises an error and the
   process exits non-zero.

The choice of XChaCha20-Poly1305 (24-byte nonce) over
AES-256-GCM (12-byte nonce) is deliberate: random 24-byte nonces
have effectively zero collision risk, while random 12-byte nonces
require careful bookkeeping at high message counts. Argon2id is
the OWASP 2024 baseline for password-based KDFs; the parameters
match the recommendation for interactive use on a 2024-era
developer laptop.

## 6. What is NOT in the model

- **Post-quantum.** The cipher and the KDF are not post-quantum.
  Argon2id remains fine for now because a quantum computer does not
  give an asymptotic speedup against Argon2id; Grover-style
  brute-force halves the effective key length, which for a 32-byte
  master key leaves 128 bits of effective security. Acceptable for
  the threat model; revisit when NIST PQC standards are finalised.
- **Hardware security modules.** `envault` does not integrate with
  HSMs, TPMs, KMS, or the macOS Keychain. See the roadmap in the
  README.
- **Multi-party key splitting.** No Shamir / threshold scheme for
  the master key. See the roadmap.
- **Audit log.** `envault` does not record who decrypted what and
  when. The audit trail is git history (every modification to
  `.env.vault` is a commit with author + timestamp).
