import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   addHtmlOption,
   addJsonOption,
   addTargetTimeoutOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { handleAuditAction, type AuditActionOptions } from './audit-actions.js';

const AUDIT_EXAMPLES = `
Examples:
  a1 audit https://example.com
  a1 audit page.html --fail-on serious
`;

function buildAuditCommand(program: Command): Command {
   return addTargetTimeoutOption(
      addHtmlOption(
         addVerboseOption(
            addJsonOption(
               addWcagVersionOption(
                  program
                     .command('audit [target]')
                     .helpGroup(TOP_LEVEL_GROUPS.fix)
                     .summary('Scan a page and list what to fix.')
                     .description(
                        'Run the full audit loop against a target: axe, an ' +
                           'accessibility tree summary, WCAG applicability, and a ' +
                           'criterion rollup.',
                     )
                     .addHelpText('after', AUDIT_EXAMPLES)
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
                     ),
               ),
            ),
         ),
      ),
   );
}

export function registerAuditCommand(program: Command): void {
   buildAuditCommand(program).action(
      async (target: string | undefined, options: AuditActionOptions) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);

         await executeCommand(
            {
               family: 'audit',
               subcommand: 'audit',
               wcagVersion: options.wcag,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleAuditAction(target, options),
            renderers.renderAuditText,
         );
      },
   );
}
