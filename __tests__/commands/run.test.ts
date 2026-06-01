import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runWithVault } from '../../src/commands/run.js';
import { createVault } from '../../src/vault.js';
import { encryptValue } from '../../src/crypto.js';
import { deriveMasterKey } from '../../src/kdf.js';
import { TEST_KDF, TEST_PASSWORD } from '../helpers.js';
import type { Vault, VaultVar } from '../../src/types.js';

describe('run command', () => {
  let vault: Vault;
  let masterKey: Uint8Array;

  beforeEach(() => {
    vault = createVault(TEST_KDF);
    masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);

    const addVar = (key: string, value: string, comment?: string) => {
      const enc = encryptValue(masterKey, key, value);
      const entry: VaultVar = {
        nonce: Buffer.from(enc.nonce).toString('base64'),
        ciphertext: Buffer.from(enc.ciphertext).toString('base64'),
      };
      if (comment) entry.comment = comment;
      vault.vars[key] = entry;
    };
    addVar('TEST_VAR', 'hello-world');
    addVar('ANOTHER_VAR', 'secret-value');
    addVar('EMPTY_VAR', '');
  });

  afterEach(() => {
    delete process.env['TEST_VAR'];
    delete process.env['ANOTHER_VAR'];
    delete process.env['EMPTY_VAR'];
  });

  it('child process sees decrypted env vars', async () => {
    const result = await runWithVault(
      process.execPath,
      ['-e', "process.stdout.write(process.env.TEST_VAR || 'MISSING')"],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hello-world');
  });

  it('child process sees multiple decrypted env vars', async () => {
    const result = await runWithVault(
      process.execPath,
      [
        '-e',
        "process.stdout.write((process.env.TEST_VAR || '') + ':' + (process.env.ANOTHER_VAR || ''))",
      ],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hello-world:secret-value');
  });

  it('child process sees empty value', async () => {
    const result = await runWithVault(
      process.execPath,
      ['-e', "process.stdout.write('[' + (process.env.EMPTY_VAR || '') + ']')"],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('[]');
  });

  it('decrypted vars override parent env vars with same name', async () => {
    process.env['TEST_VAR'] = 'parent-value';
    const result = await runWithVault(
      process.execPath,
      ['-e', "process.stdout.write(process.env.TEST_VAR || 'MISSING')"],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hello-world');
  });

  it('parent env is not modified by run', async () => {
    const before = process.env['TEST_VAR'];
    delete process.env['TEST_VAR'];
    await runWithVault(
      process.execPath,
      ['-e', ''],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(process.env['TEST_VAR']).toBe(before);
  });

  it('child process inherits parent PATH', async () => {
    const result = await runWithVault(
      process.execPath,
      ['-e', "process.stdout.write(process.env.PATH ? 'has-path' : 'no-path')"],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('has-path');
  });

  it('propagates child exit code', async () => {
    const result = await runWithVault(
      process.execPath,
      ['-e', 'process.exit(42)'],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(42);
  });

  it('captures stderr', async () => {
    const result = await runWithVault(
      process.execPath,
      ['-e', "process.stderr.write('oops')"],
      vault,
      masterKey,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('oops');
  });
});
