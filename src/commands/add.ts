import { createVault, readVault, vaultExists, writeVault } from '../vault.js';
import { encryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import { isValidKey } from '../envfile.js';
import type { GlobalOptions, Vault, VaultVar } from '../types.js';

export interface AddOptions {
  comment?: string;
}

function toPasswordOptions(opts: GlobalOptions) {
  return {
    passwordFile: opts.passwordFile,
    passwordStdin: opts.passwordStdin,
    passwordPrompt: opts.passwordPrompt,
  };
}

export async function addCommand(
  entry: string,
  cmdOpts: AddOptions,
  globalOpts: GlobalOptions,
): Promise<void> {
  const eqIdx = entry.indexOf('=');
  if (eqIdx === -1) {
    throw new Error('Invalid format. Expected KEY=VALUE');
  }
  const key = entry.slice(0, eqIdx).trim();
  const value = entry.slice(eqIdx + 1);
  if (!isValidKey(key)) {
    throw new Error(
      `Invalid key: "${key}". Keys must match [A-Za-z_][A-Za-z0-9_]*`,
    );
  }

  const password = await getPassword(toPasswordOptions(globalOpts));
  const vault: Vault = vaultExists(globalOpts.vault)
    ? readVault(globalOpts.vault)
    : createVault();
  const masterKey = deriveMasterKey(password, vault.kdf);
  const { nonce, ciphertext } = encryptValue(masterKey, key, value);

  const existing = vault.vars[key];
  const updated: VaultVar = {
    nonce: Buffer.from(nonce).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
  if (cmdOpts.comment !== undefined) {
    updated.comment = cmdOpts.comment;
  } else if (existing?.comment) {
    updated.comment = existing.comment;
  }
  vault.vars[key] = updated;
  writeVault(globalOpts.vault, vault);
  process.stdout.write(`Added ${key}\n`);
}
