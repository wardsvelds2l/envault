import { readVault } from '../vault.js';
import { decryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import { writeEnvFile } from '../envfile.js';
import type { EnvEntry, GlobalOptions } from '../types.js';

export interface UnlockOptions {
  from?: string;
  to: string;
}

export async function unlockCommand(
  cmdOpts: UnlockOptions,
  globalOpts: GlobalOptions,
): Promise<void> {
  const source = cmdOpts.from ?? globalOpts.vault;
  const vault = readVault(source);
  const password = await getPassword({
    passwordFile: globalOpts.passwordFile,
    passwordStdin: globalOpts.passwordStdin,
    passwordPrompt: globalOpts.passwordPrompt,
  });
  const masterKey = deriveMasterKey(password, vault.kdf);
  const entries: EnvEntry[] = [];
  for (const [key, vv] of Object.entries(vault.vars)) {
    let value: string;
    try {
      value = decryptValue(
        masterKey,
        key,
        Buffer.from(vv.nonce, 'base64'),
        Buffer.from(vv.ciphertext, 'base64'),
      );
    } catch (e) {
      throw new Error(
        `Failed to decrypt ${key}: ${(e as Error).message}. Wrong password or corrupted vault.`,
      );
    }
    const entry: EnvEntry = { key, value };
    if (vv.comment) entry.comment = vv.comment;
    entries.push(entry);
  }
  writeEnvFile(cmdOpts.to, entries);
  process.stdout.write(`Unlocked ${entries.length} variable(s) to ${cmdOpts.to}\n`);
}
