# Examples

Working examples of `envault` in real-world settings. Each file is
self-contained and intended to be copied into a project as-is.

| File | What it shows |
| --- | --- |
| [`github-actions.yml`](./github-actions.yml) | Pull the master password from a GitHub Actions secret, decrypt the vault, run the test suite. |
| [`gitlab-ci.yml`](./gitlab-ci.yml) | Same pattern for GitLab CI: masked variable, `envault run --`, no plaintext `.env` in the job. |
| [`multi-env.sh`](./multi-env.sh) | Bootstrap script for a project with separate `dev`, `staging`, and `production` vaults. |
| [`threat-model.md`](./threat-model.md) | The formal threat model: assets, adversaries, attack vectors, mitigations, residual risks. |
| [`rotate-after-compromise.md`](./rotate-after-compromise.md) | Incident-response runbook for a suspected master-password leak. |

## How to use

```bash
# In your own repo, after `envault init` and `envault add KEY=VALUE`:
cp examples/github-actions.yml .github/workflows/test.yml
# Add ENVVAULT_PASSWORD to your repo's GitHub Actions secrets.
# Commit .env.vault. The CI workflow will decrypt it at job start.
```

Read [`threat-model.md`](./threat-model.md) before adopting `envault`
for a new project — it is short and saves arguments later.
