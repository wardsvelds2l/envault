import { describe, it, expect } from 'vitest';
import { deriveMasterKey, generateSalt, SALT_LENGTH, MASTER_KEY_LENGTH } from '../src/kdf.js';
import { TEST_KDF, TEST_PASSWORD, makeTestKdf } from './helpers.js';

describe('kdf', () => {
  describe('generateSalt', () => {
    it('produces 16 bytes', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(SALT_LENGTH);
    });

    it('produces different salt each call', () => {
      const a = generateSalt();
      const b = generateSalt();
      expect(Buffer.from(a).toString('base64')).not.toBe(Buffer.from(b).toString('base64'));
    });
  });

  describe('deriveMasterKey', () => {
    it('produces 32-byte key', () => {
      const key = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(MASTER_KEY_LENGTH);
    });

    it('is deterministic for same password and salt', () => {
      const a = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const b = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      expect(a).toEqual(b);
    });

    it('produces different keys for different passwords', () => {
      const a = deriveMasterKey('password-one', TEST_KDF);
      const b = deriveMasterKey('password-two', TEST_KDF);
      expect(a).not.toEqual(b);
    });

    it('produces different keys for different salts', () => {
      const a = deriveMasterKey(TEST_PASSWORD, makeTestKdf({ salt: 'AQAAAAAAAAAAAAAAAAAAAA==' }));
      const b = deriveMasterKey(TEST_PASSWORD, makeTestKdf({ salt: 'AgAAAAAAAAAAAAAAAAAAAA==' }));
      expect(a).not.toEqual(b);
    });

    it('rejects non-argon2id algorithm', () => {
      expect(() =>
        deriveMasterKey(TEST_PASSWORD, { ...TEST_KDF, algorithm: 'argon2i' as unknown as 'argon2id' }),
      ).toThrow(/Unsupported KDF algorithm/);
    });

    it('rejects too-short salt', () => {
      expect(() =>
        deriveMasterKey(TEST_PASSWORD, { ...TEST_KDF, salt: 'AA==' }),
      ).toThrow();
    });
  });
});
