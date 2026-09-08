import type { Command } from 'commander';

import { evidenceModeSchema, evidenceOutcomeSchema } from '#contracts';

import { addJsonOption, addVerboseOption } from '../lib/options.js';

interface PatternRecordOptions {
   json?: boolean;
   verbose?: boolean;
   pattern?: string;
   row?: string;
   outcome?: string;
   mode?: string;
   note?: string;
   pointer?: string;
   by?: string;
   selector?: string;
   results?: string;
}

interface PatternPendingOptions {
   json?: boolean;
   verbose?: boolean;
   pattern?: string;
   results?: string;
}

function addResultsOption(command: Command): Command {
   return command.option(
      '--results <path>',
      'Read and write recorded results at this path instead of .a11ied/evidence.jsonl.',
   );
}

async function resolveSubject(target: string | undefined): Promise<string> {
   const [{ resolvePageTarget }, { buildPageTargetInput }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('#core'),
   ]);
   const resolved = await resolvePageTarget(
      buildPageTargetInput(target, {}, 'pattern record'),
   );
   return core.stripFragment(resolved.reportTarget.value);
}

/**
 * Hashes the widget's accessibility tree as it is now, and stores it with the judgment.
 *
 * This is what lets a later run tell that the component changed since somebody decided a
 * row did not apply, so a recorded judgment expires instead of standing forever.
 */
async function hashWidget(target: string, selector: string): Promise<string> {
   const [{ resolvePageTarget }, { buildPageTargetInput }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('#core'),
   ]);
   const resolved = await resolvePageTarget(
      buildPageTargetInput(target, {}, 'pattern record'),
   );
   const tree = await core.getAccessibilityTree(resolved.load, { selector });
   return core.hashAccessibilityTree(tree);
}

function buildRecordCommand(patternCommand: Command): Command {
   return addResultsOption(
      addVerboseOption(
         addJsonOption(
            patternCommand
               .command('record <target>')
               .summary('Record a judgment about one row of an ARIA pattern example.')
               .description(
                  'Record what you decided about one row the check could not decide. Record ' +
                     'inapplicable when the component does not implement that part of the ' +
                     'pattern, and say why in the note. The next check sets the row aside until ' +
                     'the page changes under it.',
               )
               .requiredOption(
                  '--pattern <exampleId>',
                  'The APG example the row belongs to.',
               )
               .requiredOption(
                  '--row <rowKey>',
                  'The row key, such as combobox-key-home[5].',
               )
               .requiredOption(
                  '--outcome <outcome>',
                  `One of: ${evidenceOutcomeSchema.options.join(', ')}.`,
               )
               .requiredOption(
                  '--selector <css>',
                  'The same widget selector the check used. Its accessibility tree is hashed with the judgment, so the judgment expires when the component changes.',
               )
               .option(
                  '--mode <mode>',
                  `One of: ${evidenceModeSchema.options.join(', ')}.`,
               )
               .option('--pointer <selector>', 'CSS selector for the element judged.')
               .option('--note <text>', 'Why the result is what it is.')
               .option('--by <name>', 'Who or what recorded the result.'),
         ),
      ),
   );
}

function registerRecordCommand(patternCommand: Command): void {
   buildRecordCommand(patternCommand).action(
      async (target, options: PatternRecordOptions) => {
         const [{ executeCommand }, renderers, core] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
            import('#core'),
         ]);

         await executeCommand(
            {
               family: 'pattern',
               subcommand: 'record',
               wcagVersion: undefined,
               json: options.json,
               verbose: options.verbose,
            },
            async () => ({
               result: await core.recordApgJudgment({
                  subject: await resolveSubject(target),
                  exampleId: options.pattern ?? '',
                  rowKey: options.row ?? '',
                  outcome: evidenceOutcomeSchema.parse(options.outcome),
                  subjectHash: await hashWidget(target, options.selector ?? 'body'),
                  mode:
                     options.mode === undefined
                        ? undefined
                        : evidenceModeSchema.parse(options.mode),
                  note: options.note,
                  pointer: options.pointer,
                  assertedBy: options.by,
                  evidence: { file: options.results },
               }),
            }),
            renderers.renderPatternRecordText,
         );
      },
   );
}

function registerPendingCommand(patternCommand: Command): void {
   addResultsOption(
      addVerboseOption(
         addJsonOption(
            patternCommand
               .command('pending <target>')
               .summary('List the rows of one example with no recorded result yet.')
               .description(
                  'List the rows of one APG example that have no recorded result for this target.',
               )
               .requiredOption(
                  '--pattern <exampleId>',
                  'The APG example to list rows for.',
               ),
         ),
      ),
   ).action(async (target: string, options: PatternPendingOptions) => {
      const [{ executeCommand }, renderers, core] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/index.js'),
         import('#core'),
      ]);

      await executeCommand(
         {
            family: 'pattern',
            subcommand: 'pending',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         async () => ({
            result: await core.listPendingApgRows({
               subject: await resolveSubject(target),
               exampleId: options.pattern ?? '',
               evidence: { file: options.results },
            }),
         }),
         renderers.renderPatternPendingText,
      );
   });
}

export function registerPatternEvidenceCommands(patternCommand: Command): void {
   registerRecordCommand(patternCommand);
   registerPendingCommand(patternCommand);
}
