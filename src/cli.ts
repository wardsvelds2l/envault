#!/usr/bin/env node
import { Command } from 'commander';
import type { GlobalOptions } from './types.js';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { setCommand } from './commands/set.js';
import { lockCommand } from './commands/lock.js';
import { unlockCommand } from './commands/unlock.js';
import { getCommand } from './commands/get.js';
import { runCommand } from './commands/run.js';
import { rotateCommand } from './commands/rotate.js';
import { inspectCommand } from './commands/inspect.js';

const program = new Command();

program
  .name('envault')
  .description('Encrypt .env files with XChaCha20-Poly1305 + Argon2id so they can be safely committed to git')
  .version('0.2.0')
  .option('--vault <path>', 'Path to vault file', '.env.vault')
  .option('--password-stdin', 'Read password from stdin')
  .option('--password-file <path>', 'Read password from file')
  .option('--no-password-prompt', 'Do not prompt for password');

function getGlobalOptions(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals();
  return {
    vault: String(opts.vault ?? '.env.vault'),
    passwordStdin: Boolean(opts.passwordStdin),
    passwordFile: opts.passwordFile ? String(opts.passwordFile) : undefined,
    passwordPrompt: opts.passwordPrompt !== false,
  };
}

function handleError(e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}

program
  .command('init')
  .description('Initialize a new vault')
  .action(async (_options, command) => {
    try {
      await initCommand(getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('add')
  .description('Add or update a single variable')
  .argument('<entry>', 'KEY=VALUE entry to add')
  .option('--comment <text>', 'Optional comment for the variable')
  .action(async (entry: string, options: { comment?: string }, command) => {
    try {
      await addCommand(entry, options, getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('set')
  .description('Read KEY=VALUE entries from stdin (one per line, ^D to finish)')
  .action(async (_options, command) => {
    try {
      await setCommand(getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('lock')
  .description('Encrypt a plaintext .env file into a vault')
  .option('--from <path>', 'Source .env file', '.env')
  .option('--to <path>', 'Destination vault file (overrides --vault)')
  .action(async (options: { from: string; to?: string }, command) => {
    try {
      await lockCommand(options, getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('unlock')
  .description('Decrypt a vault to a plaintext .env file')
  .option('--from <path>', 'Source vault file (overrides --vault)')
  .option('--to <path>', 'Destination .env file', '.env')
  .action(async (options: { from?: string; to: string }, command) => {
    try {
      await unlockCommand(options, getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('get')
  .description('Get a single variable value (no trailing newline)')
  .argument('<key>', 'Variable name')
  .action(async (key: string, _options, command) => {
    try {
      await getCommand(key, getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('run')
  .description('Run a command with vault vars set as environment')
  .allowUnknownOption()
  .argument('[args...]')
  .action(async (args: string[], _options, command) => {
    try {
      const code = await runCommand(args, getGlobalOptions(command));
      if (code !== 0) {
        process.exitCode = code;
      }
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('rotate')
  .description('Re-encrypt vault with a new master password')
  .action(async (_options, command) => {
    try {
      await rotateCommand(getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command('inspect')
  .description('Show vault metadata (no values)')
  .action(async (_options, command) => {
    try {
      await inspectCommand(getGlobalOptions(command));
    } catch (e) {
      handleError(e);
    }
  });

program.parseAsync(process.argv).catch((e) => {
  handleError(e);
});
