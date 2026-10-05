import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { auditAssessmentRequestSchema, type AuditAssessmentRequest } from '#contracts';
import { CliUsageError, executeAuditAssessment } from '#core';
import { executeCommand } from '../lib/execute.js';
import { addJsonOption, addVerboseOption } from '../lib/options.js';
import { renderAssessmentText } from '../renderers/assessment.js';

interface AssessmentOptions {
   json?: boolean;
   verbose?: boolean;
   app?: string;
   environment?: string;
   input?: string;
   id?: string;
   run?: string;
   inventory?: string;
   scope?: string;
   wcag?: string;
   level?: string;
   offset?: string;
   limit?: string;
   retry?: string[];
   check?: string;
   outcome?: string;
   evidence?: string[];
   reason?: string;
   partial?: boolean;
   policy?: string;
}

async function readInput(file: string | undefined): Promise<unknown> {
   if (!file) {
      return undefined;
   }
   if (file !== '-') {
      return JSON.parse(await readFile(file, 'utf8'));
   }
   const chunks: Buffer[] = [];
   for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
   }
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function buildStartRequest(
   argument: string | undefined,
   options: AssessmentOptions,
): Promise<AuditAssessmentRequest> {
   if (options.environment === '-' && options.policy === '-') {
      throw new CliUsageError(
         'audit-input-conflict',
         'Use stdin for either the environment or policy, and a file for the other.',
      );
   }
   if (options.app && argument) {
      throw new CliUsageError(
         'audit-target-conflict',
         'Choose either a URL or --app for this assessment.',
      );
   }
   return auditAssessmentRequestSchema.parse({
      action: 'start',
      target: { kind: options.app ? 'app' : 'url', value: options.app ?? argument },
      file: options.run,
      runId: options.id,
      actionPolicy: await readInput(options.policy),
      environment: await readInput(options.environment),
      profile: { wcagVersion: options.wcag ?? '2.2', level: options.level ?? 'AA' },
      scope: options.scope ?? (options.app ? 'app' : 'site'),
      inventoryPath: options.inventory,
   });
}

async function buildRequest(input: {
   action: Exclude<AuditAssessmentRequest['action'], 'start'>;
   argument: string | undefined;
   options: AssessmentOptions;
}): Promise<AuditAssessmentRequest> {
   const { action, argument, options } = input;
   const base = { action, file: argument };
   switch (action) {
      case 'state':
      case 'journey':
      case 'queue': {
         const keys = { state: 'state', journey: 'journey', queue: 'check' };
         return auditAssessmentRequestSchema.parse({
            ...base,
            [keys[action]]: await readInput(options.input),
         });
      }
      case 'status': {
         return auditAssessmentRequestSchema.parse({
            ...base,
            offset: options.offset === undefined ? undefined : Number(options.offset),
            limit: options.limit === undefined ? undefined : Number(options.limit),
         });
      }
      case 'resume': {
         return auditAssessmentRequestSchema.parse({
            ...base,
            retryCheckIds: options.retry,
         });
      }
      case 'evaluate': {
         return auditAssessmentRequestSchema.parse({
            ...base,
            checkId: options.check,
            outcome: options.outcome,
            evidenceIds: options.evidence,
         });
      }
      case 'block': {
         return auditAssessmentRequestSchema.parse({
            ...base,
            checkId: options.check,
            reason: options.reason,
         });
      }
      case 'finalize': {
         return auditAssessmentRequestSchema.parse({
            ...base,
            allowPartial: options.partial ?? false,
         });
      }
      case 'next': {
         return auditAssessmentRequestSchema.parse(base);
      }
      default: {
         throw new CliUsageError('audit-action-invalid', 'Unknown assessment action.');
      }
   }
}

function registerAction(
   command: Command,
   action: AuditAssessmentRequest['action'],
): void {
   addVerboseOption(addJsonOption(command)).action(
      async (argument: string | undefined, options: AssessmentOptions) => {
         await executeCommand(
            {
               family: 'audit',
               subcommand: action === 'start' ? 'run' : action,
               wcagVersion: options.wcag,
               json: options.json,
               verbose: options.verbose,
            },
            async () => {
               const request =
                  action === 'start'
                     ? await buildStartRequest(argument, options)
                     : await buildRequest({ action, argument, options });
               const response = await executeAuditAssessment(request);
               return { target: { ...response.run.target }, result: { ...response } };
            },
            renderAssessmentText,
         );
      },
   );
}

/**
 * Run references replace hand-edited coordinator files; low-level audit commands remain
 * available.
 */
function registerStartCommand(auditCommand: Command): void {
   registerAction(
      auditCommand
         .command('run [url]')
         .summary(
            'Start an agent-led assessment; return durable work and evidence paths.',
         )
         .description(
            'Create an assessment coordinator without sending UI input. The host agent performs the returned procedures and judgments.',
         )
         .requiredOption(
            '--environment <file>',
            'Observed environment JSON; use - to read stdin.',
         )
         .option(
            '--app <name>',
            'Assess an existing desktop app target instead of a URL.',
         )
         .option(
            '--run <file>',
            'Create or attach a compatible inventory coordinator here; existing data is preserved.',
         )
         .option(
            '--inventory <file>',
            'The discovered site inventory for scoped coverage.',
         )
         .option('--scope <scope>', 'page, section, site, or app. Defaults to site.')
         .option('--wcag <version>', '2.1 or 2.2. Defaults to 2.2.')
         .option('--level <level>', 'A, AA, or AAA. Defaults to AA.')
         .option(
            '--id <id>',
            'A stable run ID using letters, digits, underscores, and hyphens.',
         )
         .option(
            '--policy <file>',
            'Approved action policy JSON; use - for stdin. Submission and destructive actions default to disabled.',
         )
         .addHelpText(
            'after',
            '\nExample:\n  a1 audit run https://createdbyfireside.com --environment environment.json --inventory inventory.json',
         ),
      'start',
   );
}

function registerScopeCommands(auditCommand: Command): void {
   registerAction(
      auditCommand
         .command('state <run>')
         .summary('Register an observed functional state.')
         .requiredOption('--input <file>', 'State JSON; use - for stdin.'),
      'state',
   );
   registerAction(
      auditCommand
         .command('journey <run>')
         .summary('Register ordered states in a complete user process.')
         .requiredOption('--input <file>', 'Journey JSON; use - for stdin.'),
      'journey',
   );
   registerAction(
      auditCommand
         .command('queue <run>')
         .summary('Add an explicit widget or assessment obligation.')
         .requiredOption('--input <file>', 'Check JSON; use - for stdin.'),
      'queue',
   );
   registerAction(
      auditCommand
         .command('next <run>')
         .summary('Claim one procedure with setup, actions, and evidence requirements.'),
      'next',
   );
   registerAction(
      auditCommand
         .command('status <run>')
         .summary('Read validated coverage and paginated scope issues.')
         .option('--offset <n>', 'List offset. Defaults to 0.')
         .option('--limit <n>', 'Items per list, 1 to 100. Defaults to 20.'),
      'status',
   );
}

function registerRecoveryCommands(auditCommand: Command): void {
   registerAction(
      auditCommand
         .command('resume <run>')
         .summary('Block interrupted work and retry only explicitly selected checks.')
         .option(
            '--retry <check...>',
            'Checks restored to a safe state; completed checks cannot be replayed.',
         ),
      'resume',
   );
   registerAction(
      auditCommand
         .command('evaluate <run>')
         .summary('Validate saved evidence and its outcome for the running check.')
         .requiredOption('--check <id>', 'The claimed check ID.')
         .requiredOption(
            '--outcome <outcome>',
            'passed, failed, cantTell, or inapplicable.',
         )
         .requiredOption('--evidence <id...>', 'Saved evidence IDs from audit record.'),
      'evaluate',
   );
   registerAction(
      auditCommand
         .command('block <run>')
         .summary('Preserve an unsuccessful attempt with a recovery reason.')
         .requiredOption('--check <id>', 'The check ID.')
         .requiredOption('--reason <text>', 'What blocked the check and how to recover.'),
      'block',
   );
   registerAction(
      auditCommand
         .command('finalize <run>')
         .summary(
            'Require validated scope coverage before marking the assessment complete.',
         )
         .option('--partial', 'Keep incomplete work active and return its coverage.'),
      'finalize',
   );
}

/**
 * Keep startup, scope registration, and recovery available alongside low-level audit
 * commands.
 */
export function registerAuditAssessmentCommands(auditCommand: Command): void {
   registerStartCommand(auditCommand);
   registerScopeCommands(auditCommand);
   registerRecoveryCommands(auditCommand);
}
