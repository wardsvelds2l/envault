import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes, bytesToUtf8, randomBytes } from '@noble/hashes/utils';

export const SUBKEY_CONTEXT = 'envault:v1:';

export function deriveSubkey(masterKey: Uint8Array, varName: string): Uint8Array {
  if (!(masterKey instanceof Uint8Array)) {
    throw new TypeError('masterKey must be a Uint8Array');
  }
  if (typeof varName !== 'string' || varName.length === 0) {
    throw new TypeError('varName must be a non-empty string');
  }
  const msg = utf8ToBytes(SUBKEY_CONTEXT + varName);
  return hmac(sha256, masterKey, msg);
}

export interface EncryptedValue {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export function generateNonce(): Uint8Array {
  return randomBytes(xchacha20poly1305.nonceLength);
}

export function encryptValue(
  masterKey: Uint8Array,
  varName: string,
  value: string,
): EncryptedValue {
  const subkey = deriveSubkey(masterKey, varName);
  const nonce = generateNonce();
  const aad = utf8ToBytes(varName);
  const plaintext = utf8ToBytes(value);
  const cipher = xchacha20poly1305(subkey, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return { nonce, ciphertext };
}

export function decryptValue(
  masterKey: Uint8Array,
  varName: string,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): string {
  const subkey = deriveSubkey(masterKey, varName);
  const aad = utf8ToBytes(varName);
  const cipher = xchacha20poly1305(subkey, nonce, aad);
  const plaintext = cipher.decrypt(ciphertext);
  return bytesToUtf8(plaintext);
}
