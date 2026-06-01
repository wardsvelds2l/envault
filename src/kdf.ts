import { argon2id } from '@noble/hashes/argon2';
import { utf8ToBytes } from '@noble/hashes/utils';
import type { KdfParams } from './types.js';

export const DEFAULT_KDF_PARAMS = {
  algorithm: 'argon2id' as const,
  memory: 65536,
  iterations: 3,
  parallelism: 1,
};

export const MIN_KDF_PARAMS = {
  memory: 65536,
  iterations: 3,
  parallelism: 1,
};

export const SALT_LENGTH = 16;
export const MASTER_KEY_LENGTH = 32;

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export function deriveMasterKey(password: string, params: KdfParams): Uint8Array {
  if (params.algorithm !== 'argon2id') {
    throw new Error(`Unsupported KDF algorithm: ${params.algorithm}`);
  }
  const saltBytes = Buffer.from(params.salt, 'base64');
  if (saltBytes.length < 8) {
    throw new Error('KDF salt is too short');
  }
  return argon2id(utf8ToBytes(password), saltBytes, {
    t: params.iterations,
    m: params.memory,
    p: params.parallelism,
    dkLen: MASTER_KEY_LENGTH,
  });
}
