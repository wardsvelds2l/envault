import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { addCommand } from '../../src/commands/add.js';
import { readVault, createVault, writeVault } from '../../src/vault.js';
import { deriveMasterKey, MIN_KDF_PARAMS } from '../../src/kdf.js';
import { decryptValue } from '../../src/crypto.js';
import { TEST_KDF, TEST_PASSWORD } from '../helpers.js';
import type { GlobalOptions } from '../../src/types.js';

describe('add command', () => {
  let tmpDir: string;
  let vaultPath: string;
  let originalEnvPassword: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envault-add-'));
    vaultPath = path.join(tmpDir, '.env.vault');
    originalEnvPassword = process.env['ENVVAULT_PASSWORD'];
    process.env['ENVVAULT_PASSWORD'] = TEST_PASSWORD;
  });

  afterEach(() => {
    if (originalEnvPassword === undefined) {
      delete process.env['ENVVAULT_PASSWORD'];
    } else {
      process.env['ENVVAULT_PASSWORD'] = originalEnvPassword;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const opts = (): GlobalOptions => ({
    vault: vaultPath,
    passwordStdin: false,
    passwordPrompt: false,
  });

  it('creates a vault if none exists and adds a variable', async () => {
    await addCommand('FOO=bar', {}, opts());
    const v = readVault(vaultPath);
    expect(v.version).toBe(1);
    expect(v.vars['FOO']).toBeDefined();
    expect(v.kdf.memory).toBeGreaterThanOrEqual(MIN_KDF_PARAMS.memory);
  });

  it('produces a value that round-trips through decrypt', async () => {
    await addCommand('FOO=hello world', {}, opts());
    const v = readVault(vaultPath);
    const masterKey = deriveMasterKey(TEST_PASSWORD, v.kdf);
    const vv = v.vars['FOO']!;
    const value = decryptValue(
      masterKey,
      'FOO',
      Buffer.from(vv.nonce, 'base64'),
      Buffer.from(vv.ciphertext, 'base64'),
    );
    expect(value).toBe('hello world');
  });

  it('uses existing vault KDF params (does not regenerate salt)', async () => {
    const v = createVault(TEST_KDF);
    writeVault(vaultPath, v);
    const originalSalt = v.kdf.salt;
    await addCommand('FOO=bar', {}, opts());
    const back = readVault(vaultPath);
    expect(back.kdf.salt).toBe(originalSalt);
    expect(back.kdf.memory).toBe(TEST_KDF.memory);
  });

  it('adds a comment when --comment is provided', async () => {
    await addCommand('FOO=bar', { comment: 'a comment' }, opts());
    const v = readVault(vaultPath);
    expect(v.vars['FOO']?.comment).toBe('a comment');
  });

  it('updates existing variable value', async () => {
    await addCommand('FOO=first', {}, opts());
    await addCommand('FOO=second', {}, opts());
    const v = readVault(vaultPath);
    const masterKey = deriveMasterKey(TEST_PASSWORD, v.kdf);
    const vv = v.vars['FOO']!;
    const value = decryptValue(
      masterKey,
      'FOO',
      Buffer.from(vv.nonce, 'base64'),
      Buffer.from(vv.ciphertext, 'base64'),
    );
    expect(value).toBe('second');
  });

  it('preserves existing comment when updating without --comment', async () => {
    await addCommand('FOO=first', { comment: 'original' }, opts());
    await addCommand('FOO=second', {}, opts());
    const v = readVault(vaultPath);
    expect(v.vars['FOO']?.comment).toBe('original');
  });

  it('updates comment when --comment is provided on update', async () => {
    await addCommand('FOO=first', { comment: 'original' }, opts());
    await addCommand('FOO=second', { comment: 'updated' }, opts());
    const v = readVault(vaultPath);
    expect(v.vars['FOO']?.comment).toBe('updated');
  });

  it('rejects invalid KEY', async () => {
    await expect(addCommand('1FOO=bar', {}, opts())).rejects.toThrow(/Invalid key/);
  });

  it('rejects entry without =', async () => {
    await expect(addCommand('FOO', {}, opts())).rejects.toThrow(/Invalid format/);
  });

  it('preserves = in value', async () => {
    await addCommand('FOO=a=b=c', {}, opts());
    const v = readVault(vaultPath);
    const masterKey = deriveMasterKey(TEST_PASSWORD, v.kdf);
    const vv = v.vars['FOO']!;
    const value = decryptValue(
      masterKey,
      'FOO',
      Buffer.from(vv.nonce, 'base64'),
      Buffer.from(vv.ciphertext, 'base64'),
    );
    expect(value).toBe('a=b=c');
  });

  it('handles unicode values', async () => {
    await addCommand('FOO=héllo 🌍', {}, opts());
    const v = readVault(vaultPath);
    const masterKey = deriveMasterKey(TEST_PASSWORD, v.kdf);
    const vv = v.vars['FOO']!;
    const value = decryptValue(
      masterKey,
      'FOO',
      Buffer.from(vv.nonce, 'base64'),
      Buffer.from(vv.ciphertext, 'base64'),
    );
    expect(value).toBe('héllo 🌍');
  });
});
