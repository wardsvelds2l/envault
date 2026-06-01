import { createVault, readVault, vaultExists, writeVault } from '../vault.js';
import { encryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import { isValidKey } from '../envfile.js';
import type { GlobalOptions, Vault, VaultVar } from '../types.js';

export interface SetOptions {
  input?: string;
}

export async function setCommand(
  globalOpts: GlobalOptions,
  options: SetOptions = {},
): Promise<number> {
  const password = await getPassword({
    passwordFile: globalOpts.passwordFile,
    passwordStdin: globalOpts.passwordStdin,
    passwordPrompt: globalOpts.passwordPrompt,
  });
  const vault: Vault = vaultExists(globalOpts.vault)
    ? readVault(globalOpts.vault)
    : createVault();
  const masterKey = deriveMasterKey(password, vault.kdf);

  const source = options.input !== undefined ? options.input : await readAllStdin();
  const lines = source.split(/\r?\n/);
  let count = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1);
    if (!isValidKey(key)) {
      throw new Error(`Invalid key: "${key}"`);
    }
    const { nonce, ciphertext } = encryptValue(masterKey, key, value);
    const existing = vault.vars[key];
    const updated: VaultVar = {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
    if (existing?.comment) updated.comment = existing.comment;
    vault.vars[key] = updated;
    count++;
  }
  writeVault(globalOpts.vault, vault);
  process.stdout.write(`Saved ${count} variable(s)\n`);
  return count;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}
