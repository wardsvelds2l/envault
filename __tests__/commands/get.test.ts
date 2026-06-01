import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { addCommand } from '../../src/commands/add.js';
import { getCommand } from '../../src/commands/get.js';
import { createVault, writeVault } from '../../src/vault.js';
import { TEST_KDF, TEST_PASSWORD } from '../helpers.js';
import type { GlobalOptions } from '../../src/types.js';

describe('get command', () => {
  let tmpDir: string;
  let vaultPath: string;
  let originalEnvPassword: string | undefined;
  let stdout: string[];
  let origWrite: typeof process.stdout.write;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envault-get-'));
    vaultPath = path.join(tmpDir, '.env.vault');
    originalEnvPassword = process.env['ENVVAULT_PASSWORD'];
    process.env['ENVVAULT_PASSWORD'] = TEST_PASSWORD;
    stdout = [];
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      stdout.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    // Pre-create vault with fast test KDF so addCommand doesn't use
    // production-grade Argon2id params (which timeout in CI coverage runs).
    writeVault(vaultPath, createVault(TEST_KDF));
    await addCommand('FOO=bar', {}, opts());
    await addCommand('EMPTY=', {}, opts());
    await addCommand('WITH_NEWLINE=line1\nline2', {}, opts());
  });

  afterEach(() => {
    process.stdout.write = origWrite;
    if (originalEnvPassword === undefined) {
      delete process.env['ENVVAULT_PASSWORD'];
    } else {
      process.env['ENVVAULT_PASSWORD'] = originalEnvPassword;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function opts(): GlobalOptions {
    return {
      vault: vaultPath,
      passwordStdin: false,
      passwordPrompt: false,
    };
  }

  it('prints the value to stdout', async () => {
    stdout.length = 0;
    await getCommand('FOO', opts());
    expect(stdout.join('')).toBe('bar');
  });

  it('does not add a trailing newline', async () => {
    stdout.length = 0;
    await getCommand('FOO', opts());
    expect(stdout.join('')).toBe('bar');
    expect(stdout.join('')).not.toContain('\n');
  });

  it('handles empty values', async () => {
    stdout.length = 0;
    await getCommand('EMPTY', opts());
    expect(stdout.join('')).toBe('');
  });

  it('preserves newlines in the value', async () => {
    stdout.length = 0;
    await getCommand('WITH_NEWLINE', opts());
    expect(stdout.join('')).toBe('line1\nline2');
  });

  it('throws when variable does not exist', async () => {
    await expect(getCommand('NOPE', opts())).rejects.toThrow(/not found/);
  });

  it('throws on wrong password', async () => {
    process.env['ENVVAULT_PASSWORD'] = 'wrong-password';
    await expect(getCommand('FOO', opts())).rejects.toThrow(/Failed to decrypt/);
  });

  it('a key with special chars is not in the vault', async () => {
    // The CLI argument parser validates env-var-style keys; getCommand
    // itself treats its argument as an opaque vault lookup, so an unknown
    // key (including ones that would not be a valid env var) yields "not found".
    await expect(getCommand('with-dash', opts())).rejects.toThrow(/not found/);
  });
});
