import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initCommand } from '../../src/commands/init.js';
import { readVault, vaultExists } from '../../src/vault.js';
import { MIN_KDF_PARAMS } from '../../src/kdf.js';
import type { GlobalOptions } from '../../src/types.js';

describe('init command', () => {
  let tmpDir: string;
  let vaultPath: string;
  let stdout: string[];
  let origWrite: typeof process.stdout.write;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envault-init-'));
    vaultPath = path.join(tmpDir, '.env.vault');
    stdout = [];
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      stdout.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = origWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const opts = (): GlobalOptions => ({
    vault: vaultPath,
    passwordStdin: false,
    passwordPrompt: false,
  });

  it('creates a valid empty vault', async () => {
    await initCommand(opts());
    expect(vaultExists(vaultPath)).toBe(true);
    const v = readVault(vaultPath);
    expect(v.version).toBe(1);
    expect(v.vars).toEqual({});
    expect(v.kdf.algorithm).toBe('argon2id');
    expect(v.kdf.memory).toBeGreaterThanOrEqual(MIN_KDF_PARAMS.memory);
    expect(v.kdf.iterations).toBeGreaterThanOrEqual(MIN_KDF_PARAMS.iterations);
  });

  it('uses OWASP-recommended defaults', async () => {
    await initCommand(opts());
    const v = readVault(vaultPath);
    expect(v.kdf.memory).toBe(65536);
    expect(v.kdf.iterations).toBe(3);
    expect(v.kdf.parallelism).toBe(1);
  });

  it('writes a warning about master password', async () => {
    await initCommand(opts());
    const out = stdout.join('');
    expect(out).toMatch(/WARNING/);
    expect(out).toMatch(/master password/i);
  });

  it('throws when vault already exists', async () => {
    await initCommand(opts());
    await expect(initCommand(opts())).rejects.toThrow(/already exists/);
  });

  it('respects custom --vault path', async () => {
    const customPath = path.join(tmpDir, 'custom.vault');
    await initCommand({ ...opts(), vault: customPath });
    expect(vaultExists(customPath)).toBe(true);
  });
});
