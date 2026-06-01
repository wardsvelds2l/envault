---
name: Feature request
about: Suggest an idea for envault
title: 'feat: '
labels: enhancement
assignees: ''
---

## Problem

A short description of the problem you are trying to solve. Why is the
current behaviour insufficient?

## Proposed solution

What you would like `envault` to do, ideally as a concrete CLI
command and/or `--flag` sketch:

```text
$ envault <command> [flags]
[expected output]
```

## Alternatives considered

Other approaches you have thought about, and why they are worse (or
where they would fit better).

## Threat-model implication

**Every feature in a crypto tool changes what is protected against.**
Please answer:

- Does the feature change the set of adversaries the vault resists?
- Does it require handling additional secret material (e.g. recipient
  keys, KMS material, hardware tokens)?
- Does it touch the master key, KDF parameters, AAD, or nonce generation?
  If yes, the PR **must** update the [threat model](https://github.com/wardsvelds2l/envault/blob/main/examples/threat-model.md)
  and the README's "What envault protects against / does NOT protect
  against" sections.

## Use case

Concrete scenario: which project are you using envault in, how many
variables, which environment (CI, local dev, both), and what would
this feature unlock for you?
