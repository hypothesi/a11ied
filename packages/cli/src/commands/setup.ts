import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import type { SetupOptions } from './setup-action.js';

/**
 * The action is imported when the command runs, so its dependencies do not slow down
 * every a1 command.
 */
export function registerSetupCommand(program: Command): void {
   program
      .command('setup')
      .helpGroup(TOP_LEVEL_GROUPS.setUp)
      .summary('Install a1, connect AI agents, and set up screen readers.')
      .description(
         'Offer to install a1 globally, add the a11ied skills and MCP server to the AI coding agents on this machine, and run the Guidepup setup real screen readers need. Then re-check with doctor.',
      )
      .option('-y, --yes', 'Do every step without asking, for every detected agent.')
      .option(
         '--json',
         'Print JSON instead of human-readable text. Without --yes, only the screen reader steps run.',
      )
      .option('--skip-setup', 'Skip the OS permission step (macOS only).')
      .option('--skip-install', 'Skip downloading the screen reader assets.')
      .action(async (options: SetupOptions) => {
         const { handleSetupAction } = await import('./setup-action.js');
         await handleSetupAction(options);
      });
}
