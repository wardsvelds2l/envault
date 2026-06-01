import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createVault, readVault, writeVault, vaultExists } from '../src/vault.js';
import { TEST_KDF } from './helpers.js';

describe('vault', () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envault-vault-'));
    vaultPath = path.join(tmpDir, '.env.vault');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createVault', () => {
    it('produces a valid empty vault with default OWASP params', () => {
      const v = createVault();
      expect(v.version).toBe(1);
      expect(v.kdf.algorithm).toBe('argon2id');
      expect(v.kdf.memory).toBe(65536);
      expect(v.kdf.iterations).toBe(3);
      expect(v.kdf.parallelism).toBe(1);
      expect(v.vars).toEqual({});
      // Salt should be valid base64 of 16 bytes
      const saltBytes = Buffer.from(v.kdf.salt, 'base64');
      expect(saltBytes.length).toBe(16);
    });

    it('accepts KDF overrides', () => {
      const v = createVault({ memory: 131072, iterations: 5 });
      expect(v.kdf.memory).toBe(131072);
      expect(v.kdf.iterations).toBe(5);
    });

    it('generates a unique salt each call', () => {
      const a = createVault();
      const b = createVault();
      expect(a.kdf.salt).not.toBe(b.kdf.salt);
    });
  });

  describe('writeVault / readVault', () => {
    it('round-trips a vault', () => {
      const v = createVault();
      v.vars['FOO'] = { nonce: 'AAAA', ciphertext: 'BBBB' };
      writeVault(vaultPath, v);
      const back = readVault(vaultPath);
      expect(back).toEqual(v);
    });

    it('writes file with mode 0600', () => {
      const v = createVault();
      writeVault(vaultPath, v);
      const stat = fs.statSync(vaultPath);
      // Mode bits lower 9 should be 0o600
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it('throws on missing file', () => {
      expect(() => readVault(path.join(tmpDir, 'nope.json'))).toThrow(/not found/);
    });

    it('throws on invalid JSON', () => {
      fs.writeFileSync(vaultPath, '{ this is not json');
      expect(() => readVault(vaultPath)).toThrow(/Invalid JSON/);
    });

    it('throws on unsupported version', () => {
      fs.writeFileSync(vaultPath, JSON.stringify({ version: 99, kdf: {}, vars: {} }));
      expect(() => readVault(vaultPath)).toThrow(/version/);
    });

    it('throws on unsupported KDF algorithm', () => {
      fs.writeFileSync(
        vaultPath,
        JSON.stringify({
          version: 1,
          kdf: { algorithm: 'bcrypt', memory: 1, iterations: 1, parallelism: 1, salt: 'AA==' },
          vars: {},
        }),
      );
      expect(() => readVault(vaultPath)).toThrow(/KDF/);
    });

    it('reads a vault with non-default KDF params (overrides are allowed)', () => {
      // A vault created with low-memory KDF (e.g. for tests) is still
      // structurally valid. The OWASP minimum is enforced by createVault
      // defaults, not by read.
      fs.writeFileSync(
        vaultPath,
        JSON.stringify({
          version: 1,
          kdf: {
            algorithm: 'argon2id',
            memory: 1024,
            iterations: 1,
            parallelism: 1,
            salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
          },
          vars: {},
        }),
      );
      const v = readVault(vaultPath);
      expect(v.kdf.memory).toBe(1024);
      expect(v.kdf.iterations).toBe(1);
    });

    it('vaultExists returns true for existing, false for missing', () => {
      expect(vaultExists(vaultPath)).toBe(false);
      writeVault(vaultPath, createVault());
      expect(vaultExists(vaultPath)).toBe(true);
    });

    it('readVault with valid test KDF params succeeds', () => {
      const v = createVault(TEST_KDF);
      writeVault(vaultPath, v);
      const back = readVault(vaultPath);
      expect(back.kdf.memory).toBe(TEST_KDF.memory);
    });

    it('round-trip preserves comments and ciphertext encoding', () => {
      const v = createVault();
      v.vars['FOO'] = {
        nonce: Buffer.from(new Uint8Array(24)).toString('base64'),
        ciphertext: Buffer.from(new Uint8Array(64)).toString('base64'),
        comment: 'hello world',
      };
      writeVault(vaultPath, v);
      const back = readVault(vaultPath);
      expect(back.vars['FOO']?.comment).toBe('hello world');
      expect(back.vars['FOO']?.nonce).toBe(
        Buffer.from(new Uint8Array(24)).toString('base64'),
      );
    });
  });
});
