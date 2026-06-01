import { describe, it, expect } from 'vitest';
import { encryptValue, decryptValue, deriveSubkey, SUBKEY_CONTEXT } from '../src/crypto.js';
import { deriveMasterKey } from '../src/kdf.js';
import { hmac as hmacModule } from '@noble/hashes/hmac';
import { sha256 as sha256Module } from '@noble/hashes/sha2';
import { utf8ToBytes as utf8Module } from '@noble/hashes/utils';
import { TEST_KDF, TEST_PASSWORD } from './helpers.js';

describe('crypto', () => {
  describe('deriveSubkey', () => {
    it('produces 32-byte key', () => {
      const masterKey = new Uint8Array(32);
      const subkey = deriveSubkey(masterKey, 'FOO');
      expect(subkey).toBeInstanceOf(Uint8Array);
      expect(subkey.length).toBe(32);
    });

    it('is deterministic for same input', () => {
      const masterKey = new Uint8Array(32).fill(7);
      const a = deriveSubkey(masterKey, 'FOO');
      const b = deriveSubkey(masterKey, 'FOO');
      expect(a).toEqual(b);
    });

    it('produces different keys for different variable names', () => {
      const masterKey = new Uint8Array(32).fill(7);
      const a = deriveSubkey(masterKey, 'FOO');
      const b = deriveSubkey(masterKey, 'BAR');
      expect(a).not.toEqual(b);
    });

    it('produces different keys for different master keys', () => {
      const a = deriveSubkey(new Uint8Array(32).fill(1), 'FOO');
      const b = deriveSubkey(new Uint8Array(32).fill(2), 'FOO');
      expect(a).not.toEqual(b);
    });

    it('uses domain separator context', () => {
      const masterKey = new Uint8Array(32).fill(7);
      const subkey = deriveSubkey(masterKey, 'FOO');
      // Manually compute expected
      const expected = hmacModule(sha256Module, masterKey, utf8Module(SUBKEY_CONTEXT + 'FOO'));
      expect(subkey).toEqual(expected);
    });

    it('rejects empty varName', () => {
      expect(() => deriveSubkey(new Uint8Array(32), '')).toThrow();
    });

    it('rejects non-Uint8Array master key', () => {
      expect(() => deriveSubkey('not bytes' as unknown as Uint8Array, 'FOO')).toThrow();
    });
  });

  describe('encryptValue / decryptValue roundtrip', () => {
    it('round-trips an ASCII value', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const { nonce, ciphertext } = encryptValue(masterKey, 'FOO', 'bar');
      const decrypted = decryptValue(masterKey, 'FOO', nonce, ciphertext);
      expect(decrypted).toBe('bar');
    });

    it('round-trips a unicode value', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const value = 'héllo 🌍 мир';
      const { nonce, ciphertext } = encryptValue(masterKey, 'UNICODE', value);
      const decrypted = decryptValue(masterKey, 'UNICODE', nonce, ciphertext);
      expect(decrypted).toBe(value);
    });

    it('round-trips an empty value', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const { nonce, ciphertext } = encryptValue(masterKey, 'EMPTY', '');
      const decrypted = decryptValue(masterKey, 'EMPTY', nonce, ciphertext);
      expect(decrypted).toBe('');
    });

    it('round-trips a long value', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const value = 'A'.repeat(10000);
      const { nonce, ciphertext } = encryptValue(masterKey, 'LONG', value);
      const decrypted = decryptValue(masterKey, 'LONG', nonce, ciphertext);
      expect(decrypted).toBe(value);
    });

    it('produces a different nonce each call', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const a = encryptValue(masterKey, 'FOO', 'bar');
      const b = encryptValue(masterKey, 'FOO', 'bar');
      expect(Buffer.from(a.nonce).toString('base64')).not.toBe(
        Buffer.from(b.nonce).toString('base64'),
      );
    });

    it('produces a different ciphertext for the same value (random nonce)', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const a = encryptValue(masterKey, 'FOO', 'bar');
      const b = encryptValue(masterKey, 'FOO', 'bar');
      expect(Buffer.from(a.ciphertext).toString('base64')).not.toBe(
        Buffer.from(b.ciphertext).toString('base64'),
      );
    });

    it('nonce is exactly 24 bytes (XChaCha20-Poly1305)', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const { nonce } = encryptValue(masterKey, 'FOO', 'bar');
      expect(nonce.length).toBe(24);
    });
  });

  describe('failure modes', () => {
    it('fails to decrypt with wrong master key', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const wrongKey = deriveMasterKey('wrong-password', TEST_KDF);
      const { nonce, ciphertext } = encryptValue(masterKey, 'FOO', 'secret');
      expect(() => decryptValue(wrongKey, 'FOO', nonce, ciphertext)).toThrow();
    });

    it('fails to decrypt with tampered ciphertext', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const { nonce, ciphertext } = encryptValue(masterKey, 'FOO', 'secret');
      const tampered = new Uint8Array(ciphertext);
      const lastIdx = tampered.length - 1;
      tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0xff;
      expect(() => decryptValue(masterKey, 'FOO', nonce, tampered)).toThrow();
    });

    it('fails to decrypt with tampered nonce', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const { nonce, ciphertext } = encryptValue(masterKey, 'FOO', 'secret');
      const tamperedNonce = new Uint8Array(nonce);
      tamperedNonce[0] = (tamperedNonce[0] ?? 0) ^ 0xff;
      expect(() => decryptValue(masterKey, 'FOO', tamperedNonce, ciphertext)).toThrow();
    });

    it('AAD binding: cannot decrypt one variable as another', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const a = encryptValue(masterKey, 'FOO', 'value-of-foo');
      // Try to decrypt FOO's ciphertext as BAR
      expect(() => decryptValue(masterKey, 'BAR', a.nonce, a.ciphertext)).toThrow();
    });

    it('swapping ciphertexts between keys fails', () => {
      const masterKey = deriveMasterKey(TEST_PASSWORD, TEST_KDF);
      const fooEnc = encryptValue(masterKey, 'FOO', 'foo-value');
      const barEnc = encryptValue(masterKey, 'BAR', 'bar-value');
      // Try to decrypt BAR's value using FOO's name
      expect(() =>
        decryptValue(masterKey, 'FOO', barEnc.nonce, barEnc.ciphertext),
      ).toThrow();
      // And vice versa
      expect(() =>
        decryptValue(masterKey, 'BAR', fooEnc.nonce, fooEnc.ciphertext),
      ).toThrow();
    });
  });
});
