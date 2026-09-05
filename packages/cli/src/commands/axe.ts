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
                     )
                     .option(
                        '--fail-on <impact>',
                        'Only fail on violations at or above this impact: minor, ' +
                           'moderate, serious, or critical. Defaults to any violation.',
                     )
                     .option(
                        '--baseline <file>',
                        'JSON file of accepted findings, keyed by rule id and node ' +
                           'target, that do not count toward the exit code.',
                     )
                     .option(
                        '--update-baseline',
                        'Write the current violations to --baseline instead of ' +
                           'asserting against it.',
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
