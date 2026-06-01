import type { KdfParams } from '../src/types.js';

export const TEST_KDF: KdfParams = {
  algorithm: 'argon2id',
  memory: 1024,
  iterations: 1,
  parallelism: 1,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
};

export const TEST_PASSWORD = 'test-master-password-123';

export function makeTestKdf(overrides: Partial<KdfParams> = {}): KdfParams {
  return { ...TEST_KDF, ...overrides };
}
