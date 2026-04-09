import type { Command } from 'commander';
import { registerAxeCommand } from './run-axe.js';
import { registerPatternCommand } from './run-pattern.js';

export function registerRunCommands(program: Command): void {
   const runCommand = program
      .command('run')
      .description('Execute automated rule scans and named interaction patterns.')
      .configureHelp({ sortOptions: false, sortSubcommands: false });

   registerAxeCommand(runCommand);
   registerPatternCommand(runCommand);
}
