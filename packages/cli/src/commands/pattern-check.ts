import type { Command } from 'commander';

import { cliExitCodes } from '#contracts';

import {
   addHtmlOption,
   addJsonOption,
   addTargetTimeoutOption,
   addVerboseOption,
} from '../lib/options.js';

export interface PatternCheckOptions {
   json?: boolean;
   verbose?: boolean;
   html?: string;
   timeout?: string;
   pattern?: string;
   selector?: string;
   table?: string;
   setup?: string;
}

function buildCheckCommand(patternCommand: Command): Command {
   return addTargetTimeoutOption(
      addHtmlOption(
         addVerboseOption(
            addJsonOption(
               patternCommand
                  .command('check [target]')
                  .summary('Check a page against one ARIA pattern example.')
                  .description(
                     'Press every key the APG example declares and check its documented ' +
                        'attributes against the page. Reports a declared key that does ' +
                        'nothing and an attribute that is missing; prints every other key ' +
                        "next to the guide's own description for a person to judge.",
                  )
                  .requiredOption(
                     '--pattern <exampleId>',
                     'The APG example to check against, such as combobox-select-only.',
                  )
                  .requiredOption(
                     '--selector <css>',
                     'CSS selector for the one widget to check. Required: there is no default worth guessing.',
                  )
                  .option(
                     '--table <name>',
                     'Probe a later keyboard table, such as "Listbox Popup", instead of the first.',
                  )
                  .option(
                     '--setup <keys>',
                     'Comma separated chords to press before probing, to reach the state --table documents.',
                  ),
            ),
         ),
      ),
   );
}

/**
 * Exits 4 only on the two findings the tool will defend: a key the APG declares that did
 * nothing on either probe, and an attribute that points at an id the document does not
 * have.
 *
 * A `changed` row never fails the run, because the tool saw something happen without
 * deciding whether it was the documented behavior. A plain `absent` row does not fail it
 * either: the APG's own reference combobox leaves `aria-activedescendant` off while the
 * listbox is closed, so absence usually means the widget is in another state rather than
 * that it is broken. Those are reported, and named under "May not apply", for a person to
 * judge.
 */
function resolveExitCode(result: {
   keyboardRows: Array<{ status: string }>;
   attributeRows: Array<{ status: string }>;
}): number {
   const deadKey = result.keyboardRows.some(
      (row) => row.status === 'no-observable-effect',
   );
   const brokenReference = result.attributeRows.some(
      (row) => row.status === 'broken-reference',
   );
   return deadKey || brokenReference ? cliExitCodes.assertion : cliExitCodes.success;
}

export function registerPatternCheckCommand(patternCommand: Command): void {
   buildCheckCommand(patternCommand).action(
      async (target: string | undefined, options: PatternCheckOptions) => {
         const [
            { executeCommand, resolvePageTarget },
            { buildPageTargetInput },
            renderers,
            core,
         ] = await Promise.all([
            import('../lib/execute.js'),
            import('../lib/target-input.js'),
            import('../renderers/index.js'),
            import('#core'),
         ]);

         await executeCommand(
            {
               family: 'pattern',
               subcommand: 'check',
               wcagVersion: undefined,
               json: options.json,
               verbose: options.verbose,
            },
            async () => {
               const resolved = await resolvePageTarget(
                  buildPageTargetInput(target, options, 'pattern check'),
               );
               const result = await core.runPatternCheck({
                  load: resolved.load,
                  subject: resolved.reportTarget.value,
                  exampleId: options.pattern ?? '',
                  selector: options.selector ?? '',
                  tableName: options.table,
                  setupKeys: options.setup,
               });

               return {
                  target: resolved.reportTarget,
                  result,
                  exitCode: resolveExitCode(result),
               };
            },
            renderers.renderPatternCheckText,
         );
      },
   );
}
