import type { Command } from 'commander';
import { registerCriterionVerifyCommand } from './verify-criterion.js';
import { registerLevelVerifyCommand } from './verify-level.js';

export function registerVerifyCommands(program: Command): void {
   const verifyCommand = program
      .command('verify')
      .description('Turn collected evidence into explicit WCAG verification results.')
      .configureHelp({ sortOptions: false, sortSubcommands: false });

   registerCriterionVerifyCommand(verifyCommand);
   registerLevelVerifyCommand(verifyCommand);
}
