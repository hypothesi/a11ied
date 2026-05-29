import type { Command } from 'commander';
import { addJsonOption } from '../lib/options.js';

export function registerPatternsListCommand(runCommand: Command): void {
   addJsonOption(
      runCommand
         .command('patterns')
         .description(
            'List all built-in interaction pattern IDs. Pass a pattern ID to "a1 run pattern <patternId>".',
         ),
   ).action(async (options: { json?: boolean }) => {
      const [{ executeCommand }, renderers, core] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/index.js'),
         import('#core'),
      ]);

      await executeCommand(
         {
            family: 'run',
            subcommand: 'patterns',
            wcagVersion: undefined,
            json: options.json,
         },
         () => ({ result: { patterns: core.listInteractionPatterns() } }),
         renderers.renderPatternsListText,
      );
   });
}
