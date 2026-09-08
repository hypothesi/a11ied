import type { Command } from 'commander';

import {
   addHtmlOption,
   addJsonOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import type { EvidenceActionOptions } from './audit-evidence-actions.js';

const RECORD_EXAMPLES = `
Examples:
  a1 audit record https://shop.test/cart --criterion 2.4.4 --outcome failed \\
     --pointer 'nav > a:nth-child(3)' --note "Four links read 'Learn more'."
  a1 audit record https://shop.test/cart --criterion 1.4.2 --outcome passed
`;

const PENDING_EXAMPLES = `
Examples:
  a1 audit pending https://shop.test/cart
  a1 audit pending https://shop.test/cart --level AA --json
`;

/** `--results` and `--by` apply to every evidence subcommand. */
function addEvidenceOptions(command: Command): Command {
   return command
      .option(
         '--results <file>',
         'Read and write recorded results here. Defaults to .a11ied/evidence.jsonl, ' +
            'or $A11IED_EVIDENCE.',
      )
      .option('--by <name>', 'Who or what recorded the result, such as an agent name.');
}

/** The flags that describe one recorded result. */
function addRecordOptions(command: Command): Command {
   return command
      .requiredOption(
         '--criterion <id>',
         'The WCAG success criterion the result is for, such as 2.4.4.',
      )
      .requiredOption('--outcome <outcome>', 'passed, failed, cantTell, or inapplicable.')
      .option(
         '--procedure <id>',
         'Which check was performed. Defaults to the first procedure the criterion names.',
      )
      .option(
         '--mode <mode>',
         'manual for a person alone, semiAutomatic with tool help. Defaults to semiAutomatic.',
      )
      .option('--pointer <selector>', 'CSS selector for the element judged.')
      .option('--note <text>', 'Why the result is what it is.');
}

function registerRecordCommand(auditCommand: Command): void {
   const command = addHtmlOption(
      addVerboseOption(
         addJsonOption(
            addWcagVersionOption(
               addEvidenceOptions(
                  addRecordOptions(auditCommand.command('record [target]'))
                     .summary('Record the result of a check a11ied cannot automate.')
                     .description(
                        'Record one outcome a person or an agent reached for a WCAG ' +
                           'criterion on a target, so it reaches the same report as the ' +
                           'axe results.',
                     )
                     .addHelpText('after', RECORD_EXAMPLES),
               ),
            ),
         ),
      ),
   );

   command.action(async (target: string | undefined, options: EvidenceActionOptions) => {
      const [{ executeCommand }, { handleRecordAction }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('./audit-evidence-actions.js'),
         import('../renderers/audit-evidence.js'),
      ]);

      await executeCommand(
         {
            family: 'audit',
            subcommand: 'record',
            wcagVersion: options.wcag,
            json: options.json,
            verbose: options.verbose,
         },
         () => handleRecordAction(target, options),
         renderers.renderRecordText,
      );
   });
}

function registerPendingCommand(auditCommand: Command): void {
   const command = addHtmlOption(
      addVerboseOption(
         addJsonOption(
            addWcagVersionOption(
               addEvidenceOptions(
                  auditCommand
                     .command('pending [target]')
                     .summary('List criteria for a target that still need a person.')
                     .description(
                        'List the criteria that apply to a target, that axe cannot ' +
                           'decide, and that have no recorded result yet. Reads the ' +
                           'WCAG data and the results file; it does not open a browser.',
                     )
                     .addHelpText('after', PENDING_EXAMPLES)
                     .option(
                        '--level <level>',
                        'Restrict to one WCAG level: A, AA, or AAA.',
                     ),
               ),
            ),
         ),
      ),
   );

   command.action(async (target: string | undefined, options: EvidenceActionOptions) => {
      const [{ executeCommand }, { handlePendingAction }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('./audit-evidence-actions.js'),
         import('../renderers/audit-evidence.js'),
      ]);

      await executeCommand(
         {
            family: 'audit',
            subcommand: 'pending',
            wcagVersion: options.wcag,
            json: options.json,
            verbose: options.verbose,
         },
         () => handlePendingAction(target, options),
         renderers.renderPendingText,
      );
   });
}

function registerClearCommand(auditCommand: Command): void {
   const command = addHtmlOption(
      addVerboseOption(
         addJsonOption(
            addEvidenceOptions(
               auditCommand
                  .command('clear [target]')
                  .summary('Drop recorded results for a target.')
                  .description('Remove every recorded result for one target.'),
            ),
         ),
      ),
   );

   command.action(async (target: string | undefined, options: EvidenceActionOptions) => {
      const [{ executeCommand }, { handleClearAction }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('./audit-evidence-actions.js'),
         import('../renderers/audit-evidence.js'),
      ]);

      await executeCommand(
         {
            family: 'audit',
            subcommand: 'clear',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => handleClearAction(target, options),
         renderers.renderClearText,
      );
   });
}

/**
 * Registers `record`, `pending`, and `clear` under `a1 audit`.
 *
 * They sit here rather than under a new `a1 assert` family for two reasons. The word
 * assert already means a failing check in this CLI: `a1 sr expect`, `drive-assert.ts`,
 * and exit code 4 named `assertion`. And these verbs belong next to `a1 audit`, which is
 * where a developer sees what still needs a person.
 */
export function registerAuditEvidenceCommands(auditCommand: Command): void {
   registerRecordCommand(auditCommand);
   registerPendingCommand(auditCommand);
   registerClearCommand(auditCommand);
}
