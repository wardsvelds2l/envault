import * as fs from 'node:fs';
import { readVault } from '../vault.js';
import type { GlobalOptions } from '../types.js';

export async function inspectCommand(globalOpts: GlobalOptions): Promise<void> {
  const vault = readVault(globalOpts.vault);
  const stat = fs.statSync(globalOpts.vault);
  process.stdout.write(`Vault: ${globalOpts.vault}\n`);
  process.stdout.write(`Version: ${vault.version}\n`);
  process.stdout.write(`Modified: ${stat.mtime.toISOString()}\n`);
  process.stdout.write(`Size: ${stat.size} bytes\n`);
  process.stdout.write(`KDF:\n`);
  process.stdout.write(`  Algorithm: ${vault.kdf.algorithm}\n`);
  process.stdout.write(`  Memory: ${vault.kdf.memory} KiB\n`);
  process.stdout.write(`  Iterations: ${vault.kdf.iterations}\n`);
  process.stdout.write(`  Parallelism: ${vault.kdf.parallelism}\n`);
  process.stdout.write(`Variables: ${Object.keys(vault.vars).length}\n`);
  const names = Object.keys(vault.vars).sort();
  for (const name of names) {
    const vv = vault.vars[name];
    if (!vv) continue;
    const cmt = vv.comment ? `  # ${vv.comment}` : '';
    process.stdout.write(`  - ${name}${cmt}\n`);
  }
}
