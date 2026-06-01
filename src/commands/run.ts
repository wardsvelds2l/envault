import { spawn } from 'node:child_process';
import type { ChildProcess, StdioOptions } from 'node:child_process';
import { readVault } from '../vault.js';
import { decryptValue } from '../crypto.js';
import { getPassword } from '../password.js';
import { deriveMasterKey } from '../kdf.js';
import type { GlobalOptions, Vault } from '../types.js';

export interface RunResult {
  code: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export async function runWithVault(
  cmd: string,
  args: string[],
  vault: Vault,
  masterKey: Uint8Array,
  options: { stdio?: StdioOptions } = {},
): Promise<RunResult> {
  const decrypted: Record<string, string> = {};
  for (const [key, vv] of Object.entries(vault.vars)) {
    decrypted[key] = decryptValue(
      masterKey,
      key,
      Buffer.from(vv.nonce, 'base64'),
      Buffer.from(vv.ciphertext, 'base64'),
    );
  }
  return new Promise((resolve, reject) => {
    const stdio: StdioOptions = options.stdio ?? 'inherit';
    const child: ChildProcess = spawn(cmd, args, {
      stdio,
      env: { ...process.env, ...decrypted },
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
    }
    child.on('exit', (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
    child.on('error', (err) => reject(err));
  });
}

export async function runCommand(
  args: string[],
  globalOpts: GlobalOptions,
): Promise<number> {
  if (args.length === 0) {
    throw new Error('No command provided. Usage: envault run -- cmd arg1 arg2');
  }
  const [cmd, ...rest] = args;
  if (!cmd) {
    throw new Error('No command provided');
  }
  const vault = readVault(globalOpts.vault);
  const password = await getPassword({
    passwordFile: globalOpts.passwordFile,
    passwordStdin: globalOpts.passwordStdin,
    passwordPrompt: globalOpts.passwordPrompt,
  });
  const masterKey = deriveMasterKey(password, vault.kdf);
  const result = await runWithVault(cmd, rest, vault, masterKey, {
    stdio: 'inherit',
  });
  return result.code;
}
