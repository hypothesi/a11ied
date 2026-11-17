import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   addClickOption,
   addHtmlOption,
   addJsonOption,
   addStorageStateOption,
   addTargetTimeoutOption,
   addVerboseOption,
   addWaitForOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { handleCheckAction, type CheckActionOptions } from './check-actions.js';

interface CheckCommandOptions extends CheckActionOptions {
   format?: string;
   out?: string;
}

const CHECK_EXAMPLES = `
Examples:
  a1 check http://localhost:3000/checkout
  a1 check page.html --fail-on serious
`;

function addCheckLevelOption(command: Command): Command {
   return command.option(
      '--level <level>',
      'Check WCAG through this level: A, AA, or AAA.',
   );
}

function buildCheckCommand(program: Command): Command {
   return addStorageStateOption(
      addClickOption(
         addWaitForOption(
            addTargetTimeoutOption(
               addHtmlOption(
                  addVerboseOption(
                     addJsonOption(
                        addWcagVersionOption(
                           addCheckLevelOption(
                              program
                                 .command('check [target]')
                                 .helpGroup(TOP_LEVEL_GROUPS.fix)
                                 .summary(
                                    'Scan one page during development and list what to fix.',
                                 )
                                 .description(
                                    'Scan one page with axe and print an accessibility tree summary and ' +
                                       'the criteria that apply. A clean scan never passes a criterion. ' +
                                       'For judged outcomes and a report, run a1 audit.',
                                 )
                                 .addHelpText('after', CHECK_EXAMPLES)
                                 .option(
                                    '--fail-on <impact>',
                                    'Only fail on axe violations at or above this impact: ' +
                                       'minor, moderate, serious, or critical. Defaults to any ' +
                                       'violation.',
                                 )
                                 .option(
                                    '--baseline <file>',
                                    'JSON file of accepted axe findings that do not count ' +
                                       'toward the exit code.',
                                 )
                                 .option(
                                    '--update-baseline',
                                    'Write the current axe violations to --baseline instead ' +
                                       'of asserting against it.',
                                 )
                                 .option(
                                    '--format <format>',
                                    'Output format: text, json, or earl. Defaults to text ' +
                                       '(json with --json).',
                                 )
                                 .option(
                                    '--out <file>',
                                    'Write the report to this file instead of stdout.',
                                 ),
                           ),
                        ),
                     ),
                  ),
               ),
            ),
         ),
      ),
   );
}

export function registerCheckCommand(program: Command): void {
   buildCheckCommand(program).action(
      async (target: string | undefined, options: CheckCommandOptions) => {
         if (options.format === 'earl') {
            const { handleCheckEarlFormat } = await import('./check-earl-output.js');
            await handleCheckEarlFormat(target, options);
            return;
         }

         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);

         await executeCommand(
            {
               family: 'check',
               subcommand: 'check',
               wcagVersion: options.wcag,
               json: options.json || options.format === 'json',
               verbose: options.verbose,
               out: options.out,
            },
            () => handleCheckAction(target, options),
            renderers.renderCheckText,
         );
      },
   );
}
