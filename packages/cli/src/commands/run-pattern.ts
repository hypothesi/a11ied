import type { Command } from 'commander';
import {
   addAllowVirtualOption,
   addJsonOption,
   addRecordingOption,
   addSessionOption,
   addTargetOption,
   addVerboseOption,
} from '../lib/options.js';
import { handlePatternAction, type PatternActionOptions } from './run-actions.js';

function buildPatternCommand(runCommand: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addAllowVirtualOption(
            addTargetOption(
               addSessionOption(
                  addRecordingOption(
                     runCommand
                        .command('pattern <patternId>')
                        .description('Run a named built-in interaction pattern.')
                        .option(
                           '--url <url>',
                           'Run the pattern against one live URL target.',
                        ),
                  ),
               ),
            ),
         ),
      ),
   );
}

export function registerPatternCommand(runCommand: Command): void {
   buildPatternCommand(runCommand).action(
      async (patternId: string, options: PatternActionOptions) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);

         await executeCommand(
            {
               family: 'run',
               subcommand: 'pattern',
               wcagVersion: undefined,
               json: options.json,
               verbose: options.verbose,
            },
            () => handlePatternAction(patternId, options),
            renderers.renderPatternText,
         );
      },
   );
}
