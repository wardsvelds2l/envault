import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Vault, KdfParams } from './types.js';
import { DEFAULT_KDF_PARAMS, generateSalt } from './kdf.js';

export function createVault(overrides?: Partial<KdfParams>): Vault {
  const salt = generateSalt();
  const kdf: KdfParams = {
    algorithm: 'argon2id',
    memory: DEFAULT_KDF_PARAMS.memory,
    iterations: DEFAULT_KDF_PARAMS.iterations,
    parallelism: DEFAULT_KDF_PARAMS.parallelism,
    salt: Buffer.from(salt).toString('base64'),
    ...overrides,
  };
  if (overrides) {
    if (overrides.algorithm) kdf.algorithm = overrides.algorithm;
  }
  return {
    version: 1,
    kdf,
    vars: {},
  };
}

export function readVault(vaultPath: string): Vault {
  const abs = path.resolve(vaultPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Vault file not found: ${vaultPath}`);
  }
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${vaultPath}`);
  }
  const content = fs.readFileSync(abs, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON in vault file ${vaultPath}: ${(e as Error).message}`);
  }
  return validateVault(parsed, vaultPath);
}

export function writeVault(vaultPath: string, vault: Vault): void {
  const abs = path.resolve(vaultPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const json = JSON.stringify(vault, null, 2) + '\n';
  fs.writeFileSync(abs, json, { encoding: 'utf8', mode: 0o600 });
}

export function vaultExists(vaultPath: string): boolean {
  return fs.existsSync(path.resolve(vaultPath));
}

function validateVault(obj: unknown, source: string): Vault {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`Invalid vault: expected object in ${source}`);
  }
  const o = obj as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error(`Unsupported vault version: ${o.version} in ${source}`);
  }
  if (typeof o.kdf !== 'object' || o.kdf === null) {
    throw new Error(`Invalid vault: missing kdf in ${source}`);
  }
  const k = o.kdf as Record<string, unknown>;
  if (k.algorithm !== 'argon2id') {
    throw new Error(`Unsupported KDF algorithm: ${k.algorithm}`);
  }
  if (
    typeof k.memory !== 'number' ||
    typeof k.iterations !== 'number' ||
    typeof k.parallelism !== 'number' ||
    typeof k.salt !== 'string'
  ) {
    throw new Error(`Invalid KDF parameters in ${source}`);
  }
  if (typeof o.vars !== 'object' || o.vars === null) {
    throw new Error(`Invalid vault: missing vars in ${source}`);
  }
  return obj as Vault;
}
