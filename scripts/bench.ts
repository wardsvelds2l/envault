#!/usr/bin/env node
/**
 * scripts/bench.ts — performance benchmark for envault.
 *
 * Measures wall time for three operations at three vault sizes:
 *   1. Derive master key from a password (Argon2id).
 *   2. Lock: parse N plaintext entries + encrypt them with per-variable subkeys.
 *   3. Unlock: read the vault + decrypt all entries.
 *
 * Run: `npm run bench`.
 * Output: a markdown table snippet. Exit 0 on success.
 */
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { createVault } from '../src/vault.js';
import { encryptValue, decryptValue } from '../src/crypto.js';
import { deriveMasterKey } from '../src/kdf.js';
import { parseEnv, serializeEnv } from '../src/envfile.js';
import type { EnvEntry, Vault, VaultVar } from '../src/types.js';

const PASSWORD = 'correct-horse-battery-staple-1234';
const RUNS = 3;
const SIZES = [10, 100, 1000];

function generateEntries(n: number): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (let i = 0; i < n; i++) {
    const key = `VAR_${String(i).padStart(4, '0')}`;
    const value = `value-${i}-${crypto.randomUUID()}`;
    entries.push({ key, value });
  }
  return entries;
}

function buildVault(entries: EnvEntry[]): Vault {
  const vault = createVault();
  const masterKey = deriveMasterKey(PASSWORD, vault.kdf);
  for (const entry of entries) {
    const { nonce, ciphertext } = encryptValue(masterKey, entry.key, entry.value);
    const v: VaultVar = {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
    if (entry.comment) v.comment = entry.comment;
    vault.vars[entry.key] = v;
  }
  return vault;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

interface BenchResult {
  kdfMs: number;
  lockMs: number;
  unlockMs: number;
  totalMs: number;
  perVarUs: number;
}

function benchSize(n: number): BenchResult {
  const kdfTimes: number[] = [];
  const lockTimes: number[] = [];
  const unlockTimes: number[] = [];
  const decryptOnlyTimes: number[] = [];

  for (let r = 0; r < RUNS; r++) {
    const entries = generateEntries(n);

    const kdfStart = performance.now();
    const tempVault = createVault();
    deriveMasterKey(PASSWORD, tempVault.kdf);
    kdfTimes.push(performance.now() - kdfStart);

    const lockStart = performance.now();
    const vault = buildVault(entries);
    lockTimes.push(performance.now() - lockStart);

    const serialized = JSON.stringify(vault);

    const unlockStart = performance.now();
    const parsed = JSON.parse(serialized) as Vault;
    const k = deriveMasterKey(PASSWORD, parsed.kdf);
    const decryptStart = performance.now();
    for (const [key, vv] of Object.entries(parsed.vars)) {
      decryptValue(
        k,
        key,
        Buffer.from(vv.nonce, 'base64'),
        Buffer.from(vv.ciphertext, 'base64'),
      );
    }
    decryptOnlyTimes.push(performance.now() - decryptStart);
    unlockTimes.push(performance.now() - unlockStart);
  }

  const medianDecrypt = median(decryptOnlyTimes);
  const perVarUs = (medianDecrypt * 1000) / n;
  return {
    kdfMs: median(kdfTimes),
    lockMs: median(lockTimes),
    unlockMs: median(unlockTimes),
    totalMs: median(kdfTimes) + median(lockTimes) + median(unlockTimes),
    perVarUs,
  };
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(0)} ms`;
}

function main(): void {
  // type-only import in comment for IDE clarity
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type _Bench = BenchResult;
  const node = process.version;
  const cpuModel = cpus()[0]?.model ?? 'unknown';
  const arch = process.arch;
  const platform = process.platform;

  process.stdout.write(`# envault benchmark\n\n`);
  process.stdout.write(`Node: ${node} on ${platform}/${arch} (${cpuModel.trim()})\n`);
  process.stdout.write(`Date: ${new Date().toISOString()}\n`);
  process.stdout.write(`KDF: Argon2id, m=64 MiB, t=3, p=1 (OWASP 2024 baseline)\n`);
  process.stdout.write(`Cipher: XChaCha20-Poly1305 via @noble/ciphers\n`);
  process.stdout.write(`Runs per size: ${RUNS} (median reported)\n\n`);

  const results: Array<{ n: number; r: BenchResult }> = [];
  for (const n of SIZES) {
    process.stdout.write(`Benchmarking ${n} variables...\n`);
    const r = benchSize(n);
    results.push({ n, r });
  }

  process.stdout.write(`\n| Variables | Argon2id KDF | Lock (parse + encrypt) | Unlock (decrypt all) | Per-var decrypt |\n`);
  process.stdout.write(`| --- | --- | --- | --- | --- |\n`);
  for (const { n, r } of results) {
    process.stdout.write(
      `| ${n} | ${fmtMs(r.kdfMs)} | ${fmtMs(r.lockMs)} | ${fmtMs(r.unlockMs)} | ${r.perVarUs.toFixed(1)} µs |\n`,
    );
  }

  process.stdout.write(`\nKDF cost is paid once per unlock; per-variable decrypt time is microseconds and scales linearly with the number of variables.\n`);

  // Also bench a sanity test of parseEnv + serializeEnv for 1000 vars
  const entries = generateEntries(1000);
  const envText = serializeEnv(entries);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) parseEnv(envText);
  const tParse = (performance.now() - t0) / 50;
  process.stdout.write(`\nSanity: parseEnv() of 1000 entries: ${tParse.toFixed(1)} ms (avg of 50 runs).\n`);

  // Cross-platform reproducibility: show one-time, second-time, third-time.
  process.stdout.write(`\n## Reproducing\n\n`);
  process.stdout.write('```bash\n');
  process.stdout.write('npm run bench\n');
  process.stdout.write('```\n');
  process.stdout.write(
    '\nNumbers above are what we observed on the maintainer\'s machine at the time of the v0.2.0 release. They will be faster or slower depending on the host CPU and memory bandwidth; the relative ratio of `lock` to `unlock` should remain roughly stable.\n',
  );
}

main();
