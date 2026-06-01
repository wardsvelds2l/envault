import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { lockCommand } from '../../src/commands/lock.js';
import { unlockCommand as unlock } from '../../src/commands/unlock.js';
import { readVault } from '../../src/vault.js';
import { deriveMasterKey } from '../../src/kdf.js';
import { decryptValue } from '../../src/crypto.js';
import { parseEnv, writeEnvFile } from '../../src/envfile.js';
import { TEST_KDF, TEST_PASSWORD } from '../helpers.js';
import { createVault, writeVault } from '../../src/vault.js';
import type { GlobalOptions } from '../../src/types.js';

describe('lock / unlock commands', () => {
  let tmpDir: string;
  let envPath: string;
  let vaultPath: string;
  let originalEnvPassword: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envault-lock-'));
    envPath = path.join(tmpDir, '.env');
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

  describe('lock', () => {
    it('encrypts a .env file into a vault', async () => {
      writeEnvFile(envPath, [
        { key: 'FOO', value: 'bar' },
        { key: 'BAZ', value: 'qux' },
      ]);
      await lockCommand({ from: envPath }, opts());
      expect(fs.existsSync(vaultPath)).toBe(true);
      const v = readVault(vaultPath);
      expect(Object.keys(v.vars).sort()).toEqual(['BAZ', 'FOO']);
    });

    it('produces values that round-trip via decrypt', async () => {
      writeEnvFile(envPath, [
        { key: 'FOO', value: 'hello' },
        { key: 'BAR', value: 'world with spaces' },
      ]);
      await lockCommand({ from: envPath }, opts());
      const v = readVault(vaultPath);
      const masterKey = deriveMasterKey(TEST_PASSWORD, v.kdf);
      for (const [key, expected] of [
        ['FOO', 'hello'],
        ['BAR', 'world with spaces'],
      ] as const) {
        const vv = v.vars[key]!;
        const value = decryptValue(
          masterKey,
          key,
          Buffer.from(vv.nonce, 'base64'),
          Buffer.from(vv.ciphertext, 'base64'),
        );
        expect(value).toBe(expected);
      }
    });

    it('preserves comments from the .env file', async () => {
      writeEnvFile(envPath, [
        { key: 'FOO', value: 'bar', comment: 'this is foo' },
      ]);
      await lockCommand({ from: envPath }, opts());
      const v = readVault(vaultPath);
      expect(v.vars['FOO']?.comment).toBe('this is foo');
    });

    it('reuses an existing vault and preserves its KDF', async () => {
      const existing = createVault(TEST_KDF);
      writeVault(vaultPath, existing);
      const originalSalt = existing.kdf.salt;
      writeEnvFile(envPath, [{ key: 'FOO', value: 'bar' }]);
      await lockCommand({ from: envPath }, opts());
      const v = readVault(vaultPath);
      expect(v.kdf.salt).toBe(originalSalt);
    });

    it('throws when source file does not exist', async () => {
      await expect(lockCommand({ from: path.join(tmpDir, 'nope.env') }, opts())).rejects.toThrow(
        /not found/,
      );
    });

    it('throws when source file has no entries', async () => {
      writeEnvFile(envPath, []);
      await expect(lockCommand({ from: envPath }, opts())).rejects.toThrow(/No variables/);
    });

    it('uses --to to override the vault path', async () => {
      const customVault = path.join(tmpDir, 'custom.vault');
      writeEnvFile(envPath, [{ key: 'FOO', value: 'bar' }]);
      await lockCommand({ from: envPath, to: customVault }, opts());
      expect(fs.existsSync(customVault)).toBe(true);
    });
  });

  describe('unlock', () => {
    beforeEach(async () => {
      writeEnvFile(envPath, [
        { key: 'FOO', value: 'hello' },
        { key: 'BAR', value: 'world' },
      ]);
      await lockCommand({ from: envPath }, opts());
    });

    it('decrypts vault back to .env', async () => {
      const outPath = path.join(tmpDir, 'out.env');
      await unlock({ to: outPath }, opts());
      const entries = parseEnv(fs.readFileSync(outPath, 'utf8'));
      expect(entries.find((e) => e.key === 'FOO')?.value).toBe('hello');
      expect(entries.find((e) => e.key === 'BAR')?.value).toBe('world');
    });

    it('round-trips: lock -> unlock preserves values', async () => {
      const outPath = path.join(tmpDir, 'out.env');
      await unlock({ to: outPath }, opts());
      const original = parseEnv(fs.readFileSync(envPath, 'utf8'));
      const unlocked = parseEnv(fs.readFileSync(outPath, 'utf8'));
      expect(unlocked).toEqual(original);
    });

    it('throws on wrong password', async () => {
      process.env['ENVVAULT_PASSWORD'] = 'wrong-password';
      const outPath = path.join(tmpDir, 'out.env');
      await expect(unlock({ to: outPath }, opts())).rejects.toThrow();
    });

    it('throws when vault does not exist', async () => {
      fs.rmSync(vaultPath);
      const outPath = path.join(tmpDir, 'out.env');
      await expect(unlock({ to: outPath }, opts())).rejects.toThrow(/not found/);
    });
  });
});
