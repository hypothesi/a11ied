import { readFileSync } from 'node:fs';
import {
   addLimitation,
   AuditError,
   listLimitations,
   removeLimitation,
   type AuditLimitation,
   blockUnit,
   buildWorkPacket,
   claimNext,
   getAuditStatus,
   getUnit,
   renderWorkPacket,
   reopenUnit,
   reportProgress,
   submitUnit,
   type Audit,
   type AuditStatus,
   type WorkPacket,
} from '@a11ied/audit';
import type { Command } from 'commander';
import {
   addAuditOptions,
   runAuditCommand,
   splitList,
   type AuditBaseOptions,
} from './run.js';

const STDIN_FD = 0;

interface NextOptions extends AuditBaseOptions {
   worker: string;
   pass?: string;
   notPass?: string;
   page?: string;
   unit?: string;
   lease?: string;
}

interface WorkerOptions extends AuditBaseOptions {
   worker: string;
}

function describeIdle(status: AuditStatus): string {
   const { units } = status;
   if (units.pending === 0 && units.claimed === 0 && units.blocked === 0) {
      return 'No work left: every unit is done. Stop here; the lead builds the report with a1 audit report.';
   }
   if (units.pending === 0 && units.claimed === 0) {
      return `No work available: the remaining ${String(units.blocked)} unit(s) are blocked and need a person. Stop here.`;
   }
   if (units.pending === 0) {
      return `No work available right now: ${String(units.claimed)} unit(s) are held by other workers. Stop here; anything they abandon returns to the queue automatically.`;
   }
   return `No queued unit matches your filters (${String(units.pending)} queued in total). Run again without --pass, --not-pass, or --page, or stop here.`;
}

function claimPacket(
   audit: Audit,
   options: NextOptions,
): { packet: WorkPacket | undefined; idle: string } {
   const unit = claimNext(audit, {
      worker: options.worker,
      passes: splitList(options.pass),
      excludePasses: splitList(options.notPass),
      pageId: options.page,
      unitId: options.unit,
      leaseMinutes: options.lease ? Number.parseInt(options.lease, 10) : undefined,
   });
   return unit
      ? { packet: buildWorkPacket(audit, unit), idle: '' }
      : { packet: undefined, idle: describeIdle(getAuditStatus(audit, 1)) };
}

function registerNext(parent: Command): void {
   addAuditOptions(
      parent
         .command('next')
         .summary('Claim the next unit of work and print its work packet.')
         .description(
            'Claim one unit: a test pass on one page. The packet lists the procedure, the ' +
               'criteria to decide, signals from the automated scan, known findings, and how to ' +
               'submit. A worker that already holds a unit gets the same unit back, so running ' +
               'this again after losing context is safe. Run one worker per parallel agent, each ' +
               'with its own --worker name.',
         )
         .requiredOption('--worker <name>', 'A stable name for this worker, such as w1.')
         .option('--pass <list>', 'Only take units in these test passes.')
         .option('--not-pass <list>', 'Never take units in these test passes.')
         .option('--page <id>', 'Only take units on this page.')
         .option('--unit <id>', 'Take this exact unit.')
         .option(
            '--lease <minutes>',
            'Minutes the claim lasts without activity. Defaults to 20.',
         ),
   ).action(async (options: NextOptions) => {
      await runAuditCommand({
         subcommand: 'next',
         options,
         work: (audit) => claimPacket(audit, options),
         text: (result) =>
            result.packet ? renderWorkPacket(result.packet) : result.idle,
      });
   });
}

function registerShow(parent: Command): void {
   addAuditOptions(
      parent
         .command('show <unit>')
         .summary('Print a unit and its work packet without claiming it.'),
   ).action(async (unitId: string, options: AuditBaseOptions) => {
      await runAuditCommand({
         subcommand: 'show',
         options,
         work: (audit) => ({ packet: buildWorkPacket(audit, getUnit(audit, unitId)) }),
         text: (result) =>
            [
               `Status: ${result.packet.unit.status}${result.packet.unit.worker ? ` (${result.packet.unit.worker})` : ''}`,
               renderWorkPacket(result.packet),
            ].join('\n'),
      });
   });
}

function readSubmission(file: string): unknown {
   const text = readFileSync(file === '-' ? STDIN_FD : file, 'utf8');
   try {
      const parsed: unknown = JSON.parse(text);
      return parsed;
   } catch (error) {
      throw new AuditError(
         'invalid-json',
         `${file === '-' ? 'stdin' : file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
   }
}

function registerSubmit(parent: Command): void {
   addAuditOptions(
      parent
         .command('submit <unit>')
         .summary("Hand in a unit's results and findings.")
         .description(
            'Submit one JSON document with an outcome for every criterion in the unit, any ' +
               'findings, the states tested, and any dismissals. For a finding with a ' +
               'screenshot spec, the page is put in that state and a cropped picture of the ' +
               'element is saved as its evidence. The submission is accepted or rejected as a ' +
               'whole. A rejection lists every problem; fix them and submit again.',
         )
         .requiredOption('--worker <name>', 'The worker that holds the unit.')
         .requiredOption(
            '--file <path>',
            'JSON file with the submission, or - for stdin.',
         ),
   ).action(async (unitId: string, options: WorkerOptions & { file: string }) => {
      await runAuditCommand({
         subcommand: 'submit',
         options,
         work: async (audit) => {
            const { captureSubmissionEvidence } = await import('#core');
            const { submission, problems } = await captureSubmissionEvidence(audit, {
               unitId,
               submission: readSubmission(options.file),
            });
            const receipt = submitUnit(audit, {
               unitId,
               worker: options.worker,
               submission,
               problems,
            });
            return { receipt, units: getAuditStatus(audit, 1).units };
         },
         text: ({ receipt, units }) =>
            [
               `Accepted ${receipt.unit.id}.`,
               ...(receipt.created.length > 0
                  ? [`New findings: ${receipt.created.join(', ')}`]
                  : []),
               ...(receipt.attached.length > 0
                  ? [`Added occurrences to: ${receipt.attached.join(', ')}`]
                  : []),
               ...(receipt.confirmed.length > 0
                  ? [`Described in your words: ${receipt.confirmed.join(', ')}`]
                  : []),
               ...(receipt.dismissed.length > 0
                  ? [`Dismissed here: ${receipt.dismissed.join(', ')}`]
                  : []),
               `Audit progress: ${String(units.done)}/${String(units.total)} units done.`,
               `Get your next unit: a1 audit next --worker ${options.worker}`,
            ].join('\n'),
      });
   });
}

function registerNote(parent: Command): void {
   addAuditOptions(
      parent
         .command('note <unit> [message]')
         .summary('Keep a claim alive and log what the worker is doing.')
         .requiredOption('--worker <name>', 'The worker that holds the unit.'),
   ).action(
      async (unitId: string, message: string | undefined, options: WorkerOptions) => {
         await runAuditCommand({
            subcommand: 'note',
            options,
            work: (audit) => ({
               unit: reportProgress(audit, { unitId, worker: options.worker, message }),
            }),
            text: (result) =>
               `Claim on ${result.unit.id} extended to ${result.unit.leaseExpiresAt ?? ''}.`,
         });
      },
   );
}

function registerBlock(parent: Command): void {
   addAuditOptions(
      parent
         .command('block <unit>')
         .summary('Park a unit that needs a person before it can be tested.')
         .description(
            'Use this when none of the unit can be done: a login is missing, the app will not ' +
               'start, or the only way forward breaks an audit rule. When only some criteria are ' +
               'affected, submit the unit and record those criteria as cannot-tell instead.',
         )
         .requiredOption('--reason <text>', 'What a person must provide or decide.')
         .option('--worker <name>', 'Who is blocking it. Defaults to lead.'),
   ).action(
      async (
         unitId: string,
         options: AuditBaseOptions & { reason: string; worker?: string },
      ) => {
         await runAuditCommand({
            subcommand: 'block',
            options,
            work: (audit) => ({
               unit: blockUnit(audit, {
                  unitId,
                  actor: options.worker ?? 'lead',
                  reason: options.reason,
               }),
            }),
            text: (result) =>
               [
                  `Blocked ${result.unit.id}. Other units are unaffected.`,
                  options.worker
                     ? `Get your next unit: a1 audit next --worker ${options.worker}`
                     : `Reopen it with: a1 audit reopen ${result.unit.id} --reason "<what changed>"`,
               ].join('\n'),
         });
      },
   );
}

function registerReopen(parent: Command): void {
   addAuditOptions(
      parent
         .command('reopen <unit>')
         .summary('Put a blocked or finished unit back in the queue.')
         .description(
            'Use after resolving a block, or to have a finished unit tested again. Reopening a ' +
               'finished unit discards its outcomes; its findings stay for the next worker to ' +
               'confirm or dismiss.',
         )
         .requiredOption('--reason <text>', 'What changed. Shown in the activity log.'),
   ).action(async (unitId: string, options: AuditBaseOptions & { reason: string }) => {
      await runAuditCommand({
         subcommand: 'reopen',
         options,
         work: (audit) => ({
            unit: reopenUnit(audit, { unitId, actor: 'lead', reason: options.reason }),
         }),
         text: (result) =>
            `Reopened ${result.unit.id}. It is back in the queue, and its earlier outcomes are kept as prior results.`,
      });
   });
}

interface LimitationOptions extends AuditBaseOptions {
   criterion?: string;
   list?: boolean;
   remove?: string;
}

function describeLimitation(limitation: AuditLimitation): string {
   return limitation.criterion === undefined
      ? limitation.text
      : `${limitation.criterion}: ${limitation.text}`;
}

function runLimitation(
   audit: Audit,
   text: string | undefined,
   options: LimitationOptions,
): string {
   if (options.list === true) {
      const lines = listLimitations(audit).map(
         (limitation, index) => `${String(index + 1)}. ${describeLimitation(limitation)}`,
      );
      return lines.length === 0 ? 'No limitations recorded.' : lines.join('\n');
   }
   if (options.remove !== undefined) {
      const removed = removeLimitation(audit, { position: Number(options.remove) });
      return `Removed limitation: ${describeLimitation(removed)}`;
   }
   if (text === undefined) {
      throw new AuditError('invalid-limitation', 'Describe what could not be tested.');
   }
   const added = addLimitation(audit, { text, criterion: options.criterion });
   return `Recorded limitation${added.criterion === undefined ? '' : ` on ${added.criterion}`}. It appears under Not verified in the report.`;
}

function registerLimitation(parent: Command): void {
   addAuditOptions(
      parent
         .command('limitation [text]')
         .summary('Record, list, or remove something the whole audit could not test.')
         .description(
            'Use this for a gap that applies to every page or screen, such as no screen ' +
               'reader or no physical device being available. The report lists it under Not ' +
               'verified. For a gap on one page, record the criterion as cannot-tell instead. ' +
               'Remove a limitation once the testing it describes has been done.',
         )
         .option('--criterion <id>', 'The criterion the gap weakens, such as 4.1.2.')
         .option('--list', 'List the recorded limitations with their numbers.')
         .option('--remove <number>', 'Remove the limitation with this number.'),
   ).action(async (text: string | undefined, options: LimitationOptions) => {
      await runAuditCommand({
         subcommand: 'limitation',
         options,
         work: (audit) => ({ message: runLimitation(audit, text, options) }),
         text: (result) => result.message,
      });
   });
}

/** Registers the commands a worker uses to take, carry out, and hand in a unit. */
export function registerWorkCommands(parent: Command): void {
   registerNext(parent);
   registerShow(parent);
   registerSubmit(parent);
   registerNote(parent);
   registerBlock(parent);
   registerReopen(parent);
   registerLimitation(parent);
}
