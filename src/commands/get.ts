import { readVault } from '../vault.js';
import { decryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import type { GlobalOptions } from '../types.js';

export async function getCommand(
  key: string,
  globalOpts: GlobalOptions,
): Promise<void> {
  const vault = readVault(globalOpts.vault);
  const vv = vault.vars[key];
  if (!vv) {
    throw new Error(`Variable not found: ${key}`);
  }
  const password = await getPassword({
    passwordFile: globalOpts.passwordFile,
    passwordStdin: globalOpts.passwordStdin,
    passwordPrompt: globalOpts.passwordPrompt,
  });
  const masterKey = deriveMasterKey(password, vault.kdf);
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
      `Failed to decrypt ${key}: ${(e as Error).message}. Wrong password?`,
    );
  }
  process.stdout.write(value);
}
