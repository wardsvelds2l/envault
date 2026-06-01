export interface KdfParams {
  algorithm: 'argon2id';
  memory: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

export interface VaultVar {
  nonce: string;
  ciphertext: string;
  comment?: string;
}

export interface Vault {
  version: 1;
  kdf: KdfParams;
  vars: Record<string, VaultVar>;
}

export interface EnvEntry {
  key: string;
  value: string;
  comment?: string;
}

export interface GlobalOptions {
  vault: string;
  passwordStdin: boolean;
  passwordFile?: string;
  passwordPrompt: boolean;
}
