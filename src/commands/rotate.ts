import { createVault, readVault, writeVault } from '../vault.js';
import { encryptValue, decryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import { createInterface } from 'node:readline';
import type { GlobalOptions, Vault, VaultVar } from '../types.js';

export async function rotateCommand(globalOpts: GlobalOptions): Promise<void> {
  const vault = readVault(globalOpts.vault);
  const oldPassword = await getPassword({
    passwordFile: globalOpts.passwordFile,
    passwordStdin: globalOpts.passwordStdin,
    passwordPrompt: globalOpts.passwordPrompt,
  });
  const oldMasterKey = deriveMasterKey(oldPassword, vault.kdf);
  const decrypted: Array<{ key: string; value: string; comment?: string }> = [];
  for (const [key, vv] of Object.entries(vault.vars)) {
    let value: string;
    try {
      value = decryptValue(
        oldMasterKey,
        key,
        Buffer.from(vv.nonce, 'base64'),
        Buffer.from(vv.ciphertext, 'base64'),
      );
    } catch (e) {
      throw new Error(
        `Failed to decrypt ${key}: ${(e as Error).message}. Wrong old password?`,
      );
    }
    const entry: { key: string; value: string; comment?: string } = { key, value };
    if (vv.comment) entry.comment = vv.comment;
    decrypted.push(entry);
  }

  const newPassword = await promptNewPassword();
  if (newPassword === oldPassword) {
    throw new Error('New password must be different from old password');
  }
  const newVault: Vault = createVault();
  const newMasterKey = deriveMasterKey(newPassword, newVault.kdf);
  for (const entry of decrypted) {
    const { nonce, ciphertext } = encryptValue(newMasterKey, entry.key, entry.value);
    const updated: VaultVar = {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
    if (entry.comment) updated.comment = entry.comment;
    newVault.vars[entry.key] = updated;
  }
  writeVault(globalOpts.vault, newVault);
  process.stdout.write(`Rotated ${decrypted.length} variable(s) to a new master password.\n`);
}

async function promptNewPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Rotate requires an interactive TTY to enter the new password. Use --password-stdin or --password-file for both passwords from a non-interactive context.',
    );
  }
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    rl.question('New master password: ', (pw1) => {
      rl.question('Confirm new master password: ', (pw2) => {
        rl.close();
        if (pw1 !== pw2) {
          reject(new Error('Passwords do not match'));
          return;
        }
        if (pw1.length === 0) {
          reject(new Error('New password cannot be empty'));
          return;
        }
        resolve(pw1);
      });
    });
    rl.on('error', (err) => reject(err));
  });
}
