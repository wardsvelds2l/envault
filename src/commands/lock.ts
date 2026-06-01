import * as fs from 'node:fs';
import { createVault, readVault, vaultExists, writeVault } from '../vault.js';
import { encryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import { readEnvFile } from '../envfile.js';
import type { GlobalOptions, Vault, VaultVar } from '../types.js';

export interface LockOptions {
  from: string;
  to?: string;
}

export async function lockCommand(
  cmdOpts: LockOptions,
  globalOpts: GlobalOptions,
): Promise<void> {
  const target = cmdOpts.to ?? globalOpts.vault;
  if (!fs.existsSync(cmdOpts.from)) {
    throw new Error(`Source file not found: ${cmdOpts.from}`);
  }
  const entries = readEnvFile(cmdOpts.from);
  if (entries.length === 0) {
    throw new Error(`No variables found in ${cmdOpts.from}`);
  }
  const password = await getPassword({
    passwordFile: globalOpts.passwordFile,
    passwordStdin: globalOpts.passwordStdin,
    passwordPrompt: globalOpts.passwordPrompt,
  });
  const vault: Vault = vaultExists(target) ? readVault(target) : createVault();
  const masterKey = deriveMasterKey(password, vault.kdf);
  for (const entry of entries) {
    const { nonce, ciphertext } = encryptValue(masterKey, entry.key, entry.value);
    const existing = vault.vars[entry.key];
    const updated: VaultVar = {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
    if (entry.comment) {
      updated.comment = entry.comment;
    } else if (existing?.comment) {
      updated.comment = existing.comment;
    }
    vault.vars[entry.key] = updated;
  }
  writeVault(target, vault);
  process.stdout.write(`Locked ${entries.length} variable(s) to ${target}\n`);
}
