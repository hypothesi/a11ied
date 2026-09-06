import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   addHtmlOption,
   addJsonOption,
   addTargetTimeoutOption,
   addVerboseOption,
} from '../lib/options.js';
import { handleTreeAction, type TreeActionOptions } from './tree-actions.js';

function buildTreeCommand(program: Command): Command {
   return addTargetTimeoutOption(
      addHtmlOption(
         addVerboseOption(
            addJsonOption(
               program
                  .command('tree [target]')
                  .helpGroup(TOP_LEVEL_GROUPS.fix)
                  .summary("Print a page's accessibility tree.")
                  .description(
                     'Print the accessibility tree for a target: an http(s) URL, a ' +
                        'file path, - for HTML on stdin, or --html.',
                  )
                  .option(
                     '--role <role>',
                     'Keep only nodes with this role, and their ancestors.',
                  )
                  .option(
                     '--name <text>',
                     'Keep only nodes whose accessible name contains this text, ' +
                        'and their ancestors.',
                  ),
            ),
         ),
      ),
   );
}

export function registerTreeCommand(program: Command): void {
   buildTreeCommand(program).action(
      async (target: string | undefined, options: TreeActionOptions) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);

         await executeCommand(
            {
               family: 'tree',
               subcommand: 'tree',
               wcagVersion: undefined,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleTreeAction(target, options),
            renderers.renderTreeText,
         );
      },
   );
}
