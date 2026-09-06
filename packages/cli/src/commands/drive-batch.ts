import { readFile } from 'node:fs/promises';

import type { Command } from 'commander';
import { driverBatchStepSchema, type DriverBatchStep } from '#contracts';
import { CliUsageError } from '#core';
import type { CommandExecution } from '../lib/helpers.js';
import {
   addDriveActionOptions,
   DRIVE_GROUPS,
   parseTimeoutMs,
   type DriveActionOptions,
} from './drive-options.js';

interface BatchOptions extends DriveActionOptions {
   continue?: boolean;
}

const BATCH_EXAMPLES = [
   '  {"action":"next","payload":{"kind":"heading"}}',
   '  {"action":"press","payload":{"keys":["Tab","Tab"]}}',
   '  {"action":"type","payload":{"text":"test@example.com"}}',
   '  {"action":"checkpoint","payload":{"label":"submitted"}}',
   '  {"action":"wait","payload":{"for":"/saved/i","timeoutMs":3000}}',
   '  {"action":"expect","payload":{"match":"Profile saved","since":"submitted"}}',
   '  {"action":"expect","payload":{"match":"error","not":true}}',
].join('\n');

async function readBatchSource(file: string | undefined): Promise<string> {
   if (file !== undefined) {
      return readFile(file, 'utf8');
   }
   const chunks: string[] = [];
   for await (const chunk of process.stdin) {
      chunks.push(String(chunk));
   }
   return chunks.join('');
}

function parseJsonLine(raw: string, line: number): unknown {
   try {
      return JSON.parse(raw);
   } catch (error) {
      throw new CliUsageError(
         'validation-error',
         `Line ${String(line)} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
         { line, raw },
      );
   }
}

interface IssueLike {
   path: PropertyKey[];
   message: string;
   errors?: unknown;
}

function isIssueBranches(value: unknown): value is IssueLike[][] {
   return Array.isArray(value) && value.every((branch) => Array.isArray(branch));
}

/**
 * A batch line fails the whole union, so Zod reports "Invalid input". The branch with the
 * fewest issues is the action the line meant, and its first issue names the field.
 */
function describeIssue(issue: IssueLike): string {
   const branches = isIssueBranches(issue.errors) ? issue.errors : [];
   const closest = branches.toSorted((left, right) => left.length - right.length)[0]?.[0];
   const chosen = closest ?? issue;
   const path = chosen.path.map(String).join('.');
   return path ? `${path}: ${chosen.message}` : chosen.message;
}

function parseBatchLine(raw: string, line: number): DriverBatchStep {
   const step = driverBatchStepSchema.safeParse(parseJsonLine(raw, line));
   if (!step.success) {
      const [issue] = step.error.issues;
      throw new CliUsageError(
         'validation-error',
         `Line ${String(line)} is not a driver action: ${issue ? describeIssue(issue) : 'invalid shape'}.`,
         { line, raw, issues: step.error.issues },
      );
   }
   return step.data;
}

/** Parses JSON lines; blank lines and lines that start with # are skipped. */
export function parseBatchSteps(source: string): DriverBatchStep[] {
   return source
      .split(/\r?\n/u)
      .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
      .filter(({ raw }) => raw !== '' && !raw.startsWith('#'))
      .map(({ raw, line }) => parseBatchLine(raw, line));
}

async function executeBatchAction(
   file: string | undefined,
   options: BatchOptions,
): Promise<CommandExecution> {
   const core = await import('#core');
   const steps = parseBatchSteps(await readBatchSource(file));
   if (steps.length === 0) {
      throw new CliUsageError('validation-error', 'The batch has no actions.', { file });
   }
   const session = await core.getActiveDriverSession();
   if (!session) {
      throw new CliUsageError(
         'missing-session',
         'No active screen reader session. Start one with "a1 sr start".',
      );
   }
   const batch = await core.runDriverSessionBatch({
      steps,
      continueOnFailure: options.continue,
      timeoutMs: parseTimeoutMs(options.timeout),
   });
   const failed = batch.steps.filter((step) => !step.ok);
   return {
      ok: failed.length === 0,
      exitCode: batch.exitCode,
      target: { kind: 'driver-session', value: session.target },
      result: { action: 'batch', total: steps.length, ...batch },
      errors: failed.map((step) => ({
         code: step.error?.code ?? 'batch-step-failed',
         message: `Line ${String(step.line)}: ${step.error?.message ?? 'failed'}`,
      })),
   };
}

export function registerBatchCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('batch [file]')
         .helpGroup(DRIVE_GROUPS.other)
         .summary('Run JSON lines of actions over one session.')
         .description(
            'Run JSON lines of actions, one per line, over one broker connection in one process. Reads stdin when no file is given. Stops at the first failed expect unless --continue.',
         )
         .option('--continue', 'Keep going after a failed expect or action.')
         .addHelpText(
            'after',
            `\nEach line is one action request, the same shape the MCP sr_action tool takes, or an expect line:\n${BATCH_EXAMPLES}\n\nBlank lines and lines starting with # are skipped. The exit code is 4 when any expect failed, else the first failed action's code, else 0.\n`,
         ),
   ).action(async (file: string | undefined, options: BatchOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive-batch.js'),
      ]);
      await executeCommand(
         {
            family: 'sr',
            subcommand: 'batch',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => executeBatchAction(file, options),
         renderers.renderDriveBatchText,
      );
   });
}
