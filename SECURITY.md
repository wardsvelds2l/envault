# Security Policy

## Reporting a vulnerability

**Please do not file public issues for security problems.** Public
issues are visible to everyone and give attackers a head start.
`envault` is a crypto tool; a weakness in the KDF, the AAD binding, the
nonce generation, or the file format can compromise every secret
encrypted with the affected version, so we treat reports with urgency.

Report privately via GitHub Security Advisories:

- [Open a private security advisory](https://github.com/wardsvelds2l/envault/security/advisories/new)
  on this repository. The maintainer is paged automatically via GitHub
  notifications; no email round-trip is needed and the report is
  visible only to the maintainer team until publication.

Please include:

- A clear description of the issue and its impact.
- Steps to reproduce, or a minimal proof-of-concept.
- Affected versions (commit SHA, tag, or `npm` version range).
- Anything we should know about your environment (Node version,
  package manager, OS, the vault file layout you were testing with).
- Whether you intend to coordinate public disclosure and on what
  timeline.

## Service-level targets

For a crypto project we commit to a tighter SLA than a typical utility:

| Stage | Target |
| --- | --- |
| **Acknowledgement** | within **24 hours** of the advisory being filed |
| **Triage and impact assessment** | within **3 business days** |
| **Fix shipped (or mitigation documented)** | within **30 days** of confirmation, faster for critical issues |
| **Public disclosure** | coordinated; we agree a date with the reporter, defaulting to **90 days** from acknowledgement |

If the report is a critical bypass (for example: master password
recovery from the vault file, forgery of ciphertext, or AAD bypass),
we aim to ship a fix within **7 days** and publish a CVE on the
public advisory.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `0.2.x` | ✅ Yes (current) |
| `0.1.x` | ⚠️ Best-effort, security fixes only |
| `< 0.1` | ❌ No |

Security fixes are back-ported to the latest minor of the current
major only. The `main` branch always tracks the next release.

## Out of scope

The following are **not** security issues in this project:

- Vulnerabilities in the project you used `envault` to encrypt.
  `envault` cannot fix a weak API key that you stored; report those
  upstream to the service that issued the key.
- Improvements to cryptographic parameter choices (e.g. "you should
  bump Argon2id memory") — those are good first issues for
  `feat:`, not security advisories.
- Issues in `envault`'s runtime dependencies (`@noble/ciphers`,
  `@noble/hashes`, `commander`); report those upstream. We monitor
  Dependabot for them.

## What you can expect from us

- We will keep you informed of triage progress, even if the answer
  is "we cannot reproduce".
- We will credit reporters in the release notes unless they ask to
  remain anonymous.
- We will not pursue legal action against researchers who act in good
  faith, stay within the coordinated-disclosure window, and avoid
  privacy violations.

## Acknowledgments

Reporters who follow the policy above are credited in the release
notes unless they ask to remain anonymous. Thank you for keeping the
ecosystem safer.
