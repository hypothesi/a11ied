import type { Command } from 'commander';
import { addJsonOption, addVerboseOption, addWcagVersionOption } from '../lib/options.js';
import { handleAxeAction, type AxeActionOptions } from './run-actions.js';

function buildAxeCommand(runCommand: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            runCommand
               .command('axe')
               .description('Run axe-core against a target.')
               .option('--url <url>', 'Run against one live URL target.')
               .option('--level <level>', 'Limit the run to one WCAG level.')
               .option(
                  '--criterion <criterion>',
                  'Limit the run to one WCAG criterion id or slug.',
               )
               .option(
                  '--rule <ruleId...>',
                  'Limit the run to one or more explicit axe rule ids.',
               ),
         ),
      ),
   );
}

export function registerAxeCommand(runCommand: Command): void {
   buildAxeCommand(runCommand).action(async (options: AxeActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/index.js'),
      ]);

      await executeCommand(
         {
            family: 'run',
            subcommand: 'axe',
            wcagVersion: options.version,
            json: options.json,
            verbose: options.verbose,
         },
         () => handleAxeAction(options),
         renderers.renderRunAxeText,
      );
   });
}
