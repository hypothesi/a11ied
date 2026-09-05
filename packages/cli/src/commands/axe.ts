import type { Command } from 'commander';
import {
   addHtmlOption,
   addJsonOption,
   addTargetTimeoutOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { handleAxeAction, type AxeActionOptions } from './axe-actions.js';

function buildAxeCommand(program: Command): Command {
   return addTargetTimeoutOption(
      addHtmlOption(
         addVerboseOption(
            addJsonOption(
               addWcagVersionOption(
                  program
                     .command('axe [target]')
                     .description(
                        'Run axe-core against a target: an http(s) URL, a file path, ' +
                           '- for HTML on stdin, or --html.',
                     )
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
         ),
      ),
   );
}

export function registerAxeCommand(program: Command): void {
   buildAxeCommand(program).action(
      async (target: string | undefined, options: AxeActionOptions) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);

         await executeCommand(
            {
               family: 'axe',
               subcommand: 'axe',
               wcagVersion: options.wcag,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleAxeAction(target, options),
            renderers.renderRunAxeText,
         );
      },
   );
}
