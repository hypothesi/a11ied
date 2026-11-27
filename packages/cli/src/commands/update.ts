import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import type { UpdateOptions } from './update-action.js';

/**
 * The action is imported when the command runs, so its dependencies do not slow down
 * every a1 command.
 */
export function registerUpdateCommand(program: Command): void {
   program
      .command('update')
      .helpGroup(TOP_LEVEL_GROUPS.setUp)
      .summary('Install the latest version of a1.')
      .description(
         'Check the npm registry for a newer a11ied, ask, then install it globally with npm. A copy installed as a project dependency is not changed; the command to update it is printed instead.',
      )
      .option('-y, --yes', 'Install without asking.')
      .option(
         '--json',
         'Print JSON instead of human-readable text. Installs only with --yes.',
      )
      .action(async (options: UpdateOptions) => {
         const { handleUpdateAction } = await import('./update-action.js');
         await handleUpdateAction(options);
      });
}
