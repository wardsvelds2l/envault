import * as fs from 'node:fs';
import { createInterface } from 'node:readline';

export interface PasswordOptions {
  passwordFile?: string;
  passwordStdin?: boolean;
  passwordPrompt?: boolean;
  envVar?: string;
}

export const DEFAULT_ENV_VAR = 'ENVVAULT_PASSWORD';

export async function getPassword(opts: PasswordOptions = {}): Promise<string> {
  const envVarName = opts.envVar ?? DEFAULT_ENV_VAR;

  if (opts.passwordFile) {
    if (!fs.existsSync(opts.passwordFile)) {
      throw new Error(`Password file not found: ${opts.passwordFile}`);
    }
    const content = fs.readFileSync(opts.passwordFile, 'utf8');
    return stripTrailingNewline(content);
  }

  if (opts.passwordStdin) {
    return readFromStdin();
  }

  const envPassword = process.env[envVarName];
  if (envPassword) {
    return envPassword;
  }

  if (opts.passwordPrompt !== false) {
    if (!process.stdin.isTTY) {
      throw new Error(
        `No TTY available for password prompt. Use --password-file <path>, --password-stdin, or set the ${envVarName} environment variable.`,
      );
    }
    return promptPassword();
  }

  throw new Error(
    `No password provided. Use --password-file, --password-stdin, or set ${envVarName}.`,
  );
}

function stripTrailingNewline(s: string): string {
  return s.replace(/(\r?\n)+$/, '');
}

function readFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(stripTrailingNewline(data));
    });
    process.stdin.on('error', (err) => reject(err));
  });
}

function promptPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    rl.question('Master password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.on('error', (err) => reject(err));
  });
}
