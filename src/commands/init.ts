import { createVault, vaultExists, writeVault } from '../vault.js';
import type { GlobalOptions } from '../types.js';

export async function initCommand(globalOpts: GlobalOptions): Promise<void> {
  if (vaultExists(globalOpts.vault)) {
    throw new Error(`Vault already exists: ${globalOpts.vault}`);
  }
  const vault = createVault();
  writeVault(globalOpts.vault, vault);
  process.stdout.write(`Created vault: ${globalOpts.vault}\n\n`);
  process.stdout.write('WARNING: The master password cannot be recovered.\n');
  process.stdout.write('Store it in a password manager (e.g. 1Password, Bitwarden, KeePass).\n\n');
  process.stdout.write('Next steps:\n');
  process.stdout.write(`  ${globalOpts.vault === '.env.vault' ? '' : '--vault ' + globalOpts.vault}envault add KEY=VALUE\n`);
  process.stdout.write('  git add .env.vault && git commit -m "Add encrypted env"\n');
}
