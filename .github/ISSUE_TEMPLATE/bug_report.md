---
name: Bug report
about: Report something that does not work as documented
title: 'bug: '
labels: bug
assignees: ''
---

## Is this a security issue?

<!-- Crypto tools have a high bar for confidentiality. If your report
     involves a real or suspected secret leak, a bypass of the master
     password, or any weakness in the encryption, KDF, or AAD binding,
     DO NOT open a public issue. Follow SECURITY.md. -->

- [ ] This is a security issue. (If checked, stop and use Security Advisories instead.)
- [ ] No, this is a regular bug.

## Environment

- **envault version:** (run `node bin/envault --version` or `npm ls envault`)
- **Node.js version:** (run `node --version`)
- **OS:** (e.g. `Ubuntu 24.04`, `macOS 15`, `Windows 11`)
- **Install method:** (e.g. `npm install -g envault@0.2.0`, `npx envault@0.2.0`, from source)
- **Vault file size:** (number of variables, approximate bytes)

## Reproduction steps

1.
2.
3.

## Expected behaviour

What you expected to happen.

## Actual behaviour

What actually happened. Paste the full CLI output (sanitised — strip any actual
secret values; if you need to share a real vault, prefer an empty test vault):

```text
$ envault <command>
[output]
```

## Additional context

Anything else that may be relevant (offline use, containerised environment, NFS
home directory, antivirus intercepting files, custom Argon2id parameters, etc.).
