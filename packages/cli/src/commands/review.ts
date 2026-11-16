import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import {
   observationBundleSliceSchema,
   conditionCaptureRequestSchema,
   reviewTargetStateSchema,
   stateSetupActionSchema,
   verdictProposalSchema,
   type StateSetupAction,
} from '#contracts';
import {
   browserReview,
   CliUsageError,
   review,
   type JudgeVerdictInput,
   type ReportReviewResult,
   type ReviewTargetStateInput,
   type RunReviewResult,
   type StartReviewResult,
   type StatusReviewResult,
} from '@a11ied/review';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import { addJsonOption } from '../lib/options.js';

const JSON_INDENT = 2;

interface CommonReviewOptions {
   runDir?: string;
   json?: boolean;
}

interface StartCommandOptions extends CommonReviewOptions {
   runId?: string;
   concurrency?: string;
   states?: string;
}

interface NextCommandOptions extends CommonReviewOptions {
   state?: string;
   agent?: string;
   count?: string;
}

interface ObserveCommandOptions extends CommonReviewOptions {
   capture?: string;
   refresh?: boolean;
   targetUrl?: string;
   slice?: string;
   setup?: string;
}

interface JudgeCommandOptions extends CommonReviewOptions {
   agent?: string;
   verdicts?: string;
   criterion?: string;
   state?: string;
   outcome?: string;
   rationale?: string;
   blockerCode?: string;
}

interface StatusCommandOptions extends CommonReviewOptions {
   full?: boolean;
}

interface ReportCommandOptions extends CommonReviewOptions {
   out?: string;
   draft?: boolean;
}

interface RunCommandOptions extends CommonReviewOptions {
   runId?: string;
   concurrency?: string;
   nextCount?: string;
   draftReport?: boolean;
   states?: string;
}

function parseOptionalInt(value: string | undefined): number | undefined {
   return typeof value === 'string' ? Number(value) : undefined;
}

async function runHandler<TResult>(
   options: { json?: boolean },
   action: () => Promise<TResult>,
   renderText: (result: TResult) => string,
): Promise<void> {
   try {
      const result = await action();
      if (options.json) {
         process.stdout.write(`${JSON.stringify(result, undefined, JSON_INDENT)}\n`);
      } else {
         process.stdout.write(`${renderText(result)}\n`);
      }
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exitCode =
         error &&
         typeof error === 'object' &&
         'exitCode' in error &&
         typeof error.exitCode === 'number'
            ? error.exitCode
            : 1;
      process.exitCode = exitCode;
      if (options.json) {
         process.stdout.write(
            `${JSON.stringify({ ok: false, error: message, exitCode }, undefined, JSON_INDENT)}\n`,
         );
      } else {
         process.stderr.write(`${message}\n`);
      }
   }
}

async function readJSONValues(source: string): Promise<unknown[]> {
   const trimmed = source.trim();
   let content = trimmed;
   if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
      content = await readFile(resolve(trimmed), 'utf8');
   }
   const parsed: unknown = JSON.parse(content);
   return Array.isArray(parsed) ? parsed : [parsed];
}

async function parseJudgeVerdicts(
   options: JudgeCommandOptions,
): Promise<JudgeVerdictInput[]> {
   if (options.verdicts) {
      return verdictProposalSchema.array().parse(await readJSONValues(options.verdicts));
   }
   if (!options.criterion || !options.state || !options.outcome) {
      throw new CliUsageError(
         'missing-judge-verdict',
         'Provide --verdicts or --criterion, --state and --outcome.',
      );
   }
   return [
      verdictProposalSchema.parse({
         criterionId: options.criterion,
         stateId: options.state,
         outcome: options.outcome,
         rationale: options.rationale ?? 'Judged via CLI review judge',
         blockerCode: options.blockerCode,
      }),
   ];
}

async function parseStates(
   source: string | undefined,
): Promise<ReviewTargetStateInput[] | undefined> {
   if (!source) {
      return undefined;
   }
   return reviewTargetStateSchema.array().parse(await readJSONValues(source));
}

async function parseSetupActions(
   source: string | undefined,
): Promise<StateSetupAction[] | undefined> {
   if (!source) {
      return undefined;
   }
   return stateSetupActionSchema.array().parse(await readJSONValues(source));
}

function registerStartSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('start [target]')
         .summary('Start a verdict-backed WCAG 2.2 AA review run.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--run-id <id>', 'Unique identifier for this review run.')
         .option('--concurrency <n>', 'Parallel observation concurrency.')
         .option(
            '--states <jsonOrFile>',
            'Pre-configured states JSON string or file path.',
         ),
   ).action(async (target: string | undefined, options: StartCommandOptions) => {
      await runHandler(
         options,
         async () => {
            const states = await parseStates(options.states);
            return browserReview.start({
               runDir: options.runDir ?? '.',
               runId: options.runId,
               target,
               states,
               concurrency: parseOptionalInt(options.concurrency),
            });
         },
         (res: StartReviewResult) =>
            [
               `Review run ${res.runId} started for ${res.targetOrigin}`,
               `States: ${res.statesCount} | Verdicts recorded: ${res.verdictsRecorded} | Open Tier-2 checks: ${res.openTier2Count}`,
               `Coverage: ${res.coverage.percentComplete}% (${res.coverage.passed} passed, ${res.coverage.failed} failed, ${res.coverage.inapplicable} inapplicable, ${res.coverage.cantTell} cantTell)`,
            ].join('\n'),
      );
   });
}

function registerNextSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('next')
         .summary('Claim the next batch of checks for a state.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--state <stateId>', 'Target state ID to claim checks on.')
         .option('--agent <agentId>', 'Agent ID holding the claim lease.')
         .option('--count <n>', 'Maximum number of checks to claim.'),
   ).action(async (options: NextCommandOptions) => {
      await runHandler(
         options,
         async () =>
            review.next({
               runDir: options.runDir ?? '.',
               stateId: options.state,
               agentId: options.agent,
               count: parseOptionalInt(options.count),
            }),
         (res) => {
            if (res.done) {
               return 'No more checks to review. Run is complete.';
            }
            if (res.coordinatorNextAction) {
               return `Broader work remains: audit next ${res.coordinatorNextAction.arguments.file} --scope site,journey --json`;
            }
            if (!res.packet) {
               const action = res.execution?.nextAction;
               if (action && 'kind' in action) {
                  return `Collect required scope for: ${action.checkIds.join(', ')}`;
               }
               return `${res.reason}: ${res.execution?.reasons.join(' ') ?? 'Inspect review status for the next action.'}`;
            }
            const checks = res.packet.checks;
            const header = `Claimed ${checks.length} checks on state ${res.packet?.stateId} (lease: ${res.packet?.lease.agentId})`;
            const items = checks
               .map((check) => `  - ${check.criterionId}: ${check.title}`)
               .join('\n');
            return `${header}\n${items}`;
         },
      );
   });
}

function registerObserveSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('observe <stateId>')
         .summary('Retrieve cached bundle slice or observe a state.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--target-url <url>', 'Target URL when observing with setup actions.')
         .option('--slice <slice>', 'Specific bundle slice to return.')
         .option('--refresh', 'Collect a fresh browser observation.')
         .option(
            '--capture <json>',
            'State-bound condition and actions JSON string or file path.',
         )
         .option('--setup <json>', 'State setup actions JSON string or file path.'),
   ).action(async (stateId: string, options: ObserveCommandOptions) => {
      await runHandler(
         options,
         async () => {
            const setup = await parseSetupActions(options.setup);
            const captureValues = options.capture
               ? await readJSONValues(options.capture)
               : undefined;
            const capture = captureValues
               ? conditionCaptureRequestSchema.array().length(1).parse(captureValues)[0]
               : undefined;
            return browserReview.observe({
               runDir: options.runDir ?? '.',
               stateId,
               capture,
               targetUrl: options.targetUrl,
               refresh: options.refresh,
               slice: options.slice
                  ? observationBundleSliceSchema.parse(options.slice)
                  : undefined,
               setup,
            });
         },
         (res) =>
            res.slice
               ? `Observed slice '${res.slice}' for state ${res.stateId}:\n${JSON.stringify(res.data, undefined, JSON_INDENT)}`
               : `Observed state ${res.stateId} (fingerprint: ${res.fingerprint})`,
      );
   });
}

function registerJudgeSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('judge')
         .summary('Record one or more verdicts for claimed checks.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--agent <agentId>', 'Agent ID committing judgments.')
         .option(
            '--verdicts <jsonOrFile>',
            'Verdicts JSON array/object or path to JSON file.',
         )
         .option('--criterion <id>', 'Criterion ID for single-verdict judge.')
         .option('--state <stateId>', 'State ID for single-verdict judge.')
         .option(
            '--outcome <outcome>',
            'Verdict outcome (passed, failed, cantTell, inapplicable).',
         )
         .option('--rationale <text>', 'Rationale for single-verdict judge.')
         .option('--blocker-code <code>', 'Blocker code when outcome is cantTell.'),
   ).action(async (options: JudgeCommandOptions) => {
      await runHandler(
         options,
         async () => {
            const verdicts = await parseJudgeVerdicts(options);
            return review.judge({
               runDir: options.runDir ?? '.',
               agentId: options.agent,
               verdicts,
            });
         },
         (res) =>
            `Recorded ${res.recordedCount} verdicts (${res.closedCount} closed, ${res.remainingCount} remaining open checks)`,
      );
   });
}

function registerResumeSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('resume')
         .summary('Resume saved work and optionally attach a matching coordinator.')
         .option('--run-dir <dir>', 'Existing review directory.')
         .requiredOption('--run-id <id>', 'Current review run ID.')
         .option('--coordinator <file>', 'Existing coordinator run file.')
         .option('--coordinator-run-id <id>', 'Expected coordinator run ID.')
         .option('--agent <agentId>', 'Worker ID resuming its pending work.'),
   ).action(
      async (
         options: CommonReviewOptions & {
            runId: string;
            coordinator?: string;
            coordinatorRunId?: string;
            agent?: string;
         },
      ) => {
         await runHandler(
            options,
            async () => {
               const hasCoordinator =
                  options.coordinator !== undefined ||
                  options.coordinatorRunId !== undefined;
               if (
                  hasCoordinator &&
                  (!options.coordinator?.trim() || !options.coordinatorRunId?.trim())
               ) {
                  throw new CliUsageError(
                     'review-coordinator-invalid',
                     'Supply both coordinator file and coordinator run ID.',
                  );
               }
               return review.resume({
                  runDir: options.runDir ?? '.',
                  runId: options.runId,
                  agentId: options.agent,
                  coordinator:
                     options.coordinator && options.coordinatorRunId
                        ? { file: options.coordinator, runId: options.coordinatorRunId }
                        : undefined,
               });
            },
            (result) =>
               `Resumed ${result.runId}: ${result.coverage.unresolved} unresolved obligations.`,
         );
      },
   );
}

function registerStatusSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('status')
         .summary('Inspect review run coverage and priority queue.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--full', 'Return full detailed state and verdict arrays.'),
   ).action(async (options: StatusCommandOptions) => {
      await runHandler(
         options,
         async () =>
            review.status({
               runDir: options.runDir ?? '.',
               full: Boolean(options.full),
            }),
         (res: StatusReviewResult) =>
            [
               `Review run: ${res.runId} (${res.targetOrigin})`,
               `Execution: ${res.execution.state}`,
               `Coverage: ${res.coverage.percentComplete}% (${res.coverage.passed} passed, ${res.coverage.failed} failed, ${res.coverage.inapplicable} inapplicable, ${res.coverage.cantTell} cantTell)`,
               `Active leases: ${res.activeLeases.length} | Actionable items: ${res.actionable.length} | Scope gaps: ${res.scopeGaps.length}`,
            ].join('\n'),
      );
   });
}

function registerReportSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('report')
         .summary('Generate final or draft review audit report files.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--out <dir>', 'Output directory for report files.')
         .option('--draft', 'Mark report as draft.'),
   ).action(async (options: ReportCommandOptions) => {
      await runHandler(
         options,
         async () =>
            review.report({
               runDir: options.runDir ?? '.',
               outDir: options.out,
               draft: Boolean(options.draft),
            }),
         (res: ReportReviewResult) =>
            [
               `Report generated for ${res.report.targetOrigin} (${res.report.isDraft ? 'draft' : 'final'})`,
               `JSON: ${res.paths.jsonPath}`,
               `HTML: ${res.paths.htmlPath}`,
               `Markdown: ${res.paths.markdownPath}`,
            ].join('\n'),
      );
   });
}

function registerRunSubcommand(reviewCmd: Command): void {
   addJsonOption(
      reviewCmd
         .command('run [target]')
         .summary('Run end-to-end review initiation and claim first batch.')
         .option(
            '--run-dir <dir>',
            'Directory where review artifacts and run state are stored.',
         )
         .option('--run-id <id>', 'Unique identifier for this review run.')
         .option('--concurrency <n>', 'Parallel observation concurrency.')
         .option('--next-count <n>', 'Number of checks to claim in the first batch.')
         .option('--no-draft-report', 'Do not generate an initial draft report.')
         .option(
            '--states <jsonOrFile>',
            'Pre-configured states JSON string or file path.',
         ),
   ).action(async (target: string | undefined, options: RunCommandOptions) => {
      await runHandler(
         options,
         async () => {
            const states = await parseStates(options.states);
            return browserReview.run({
               runDir: options.runDir ?? '.',
               runId: options.runId,
               target,
               states,
               concurrency: parseOptionalInt(options.concurrency),
               nextCount: parseOptionalInt(options.nextCount),
               draftReport: options.draftReport,
            });
         },
         (res: RunReviewResult) =>
            [
               `Review run ${res.runId} initiated for ${res.startResult.targetOrigin}.`,
               `States: ${res.startResult.statesCount} | Initial verdicts: ${res.startResult.verdictsRecorded}`,
               res.firstPacket
                  ? `Claimed ${res.firstPacket.checks.length} checks on state ${res.firstPacket.stateId}`
                  : 'No initial checks claimed.',
            ].join('\n'),
      );
   });
}

/** Registers the review command tree and its subcommands. */
export function registerReviewCommand(program: Command): void {
   const reviewCmd = program
      .command('review')
      .helpGroup(TOP_LEVEL_GROUPS.fix)
      .summary('Review pages and states against WCAG 2.2 AA.')
      .description(
         'Verdict-backed accessibility review workflow for pages and interactive states.',
      );

   registerStartSubcommand(reviewCmd);
   registerResumeSubcommand(reviewCmd);
   registerNextSubcommand(reviewCmd);
   registerObserveSubcommand(reviewCmd);
   registerJudgeSubcommand(reviewCmd);
   registerStatusSubcommand(reviewCmd);
   registerReportSubcommand(reviewCmd);
   registerRunSubcommand(reviewCmd);
}
