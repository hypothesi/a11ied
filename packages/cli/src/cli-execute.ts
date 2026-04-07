import {
   cliExitCodes,
   type CliCommandFamily,
   type CliOutputEnvelope,
} from '@a11lied/contracts';
import {
   CliUsageError,
   runDriverSessionAction,
   runEphemeralDriverAction,
} from '@a11lied/core';
import {
   type CommandExecution,
   createEnvelope,
   normalizeError,
   printOutput,
} from './cli-helpers.js';
import { resolveDriveSession } from './cli-resolvers.js';

export {
   ensureRunAxeTarget,
   ensureUrlTarget,
   parsePlatform,
   resolveRunAxeSelection,
   stripHtml,
} from './cli-resolvers.js';

function resolveExitCode(execution: CommandExecution, ok: boolean): number {
   if (execution.exitCode !== undefined) {
      return execution.exitCode;
   }
   if (ok) {
      return cliExitCodes.success;
   }
   return cliExitCodes.internal;
}

function buildSuccessEnvelope(
   args: {
      family: CliCommandFamily;
      subcommand: string;
      wcagVersion: string | undefined;
   },
   execution: CommandExecution,
   startedAt: Date,
): { envelope: CliOutputEnvelope; exitCode: number } {
   const completedAt = new Date();
   const ok = execution.ok ?? true;
   const envelope = createEnvelope({
      ok,
      family: args.family,
      subcommand: args.subcommand,
      wcagVersion: args.wcagVersion,
      target: execution.target ?? undefined,
      result: execution.result ?? undefined,
      warnings: execution.warnings ?? [],
      errors: execution.errors ?? [],
      startedAt,
      completedAt,
   });

   return { envelope, exitCode: resolveExitCode(execution, ok) };
}

function buildErrorEnvelope(
   args: {
      family: CliCommandFamily;
      subcommand: string;
      wcagVersion: string | undefined;
   },
   error: unknown,
   startedAt: Date,
): { envelope: CliOutputEnvelope; exitCode: number } {
   const completedAt = new Date();
   const normalized = normalizeError(error);
   const envelope = createEnvelope({
      ok: false,
      family: args.family,
      subcommand: args.subcommand,
      wcagVersion: args.wcagVersion,
      target: undefined,
      result: undefined,
      warnings: [],
      errors: normalized.errors,
      startedAt,
      completedAt,
   });

   return { envelope, exitCode: normalized.exitCode };
}

function renderErrorText(failedEnvelope: CliOutputEnvelope): string {
   const code = failedEnvelope.errors[0]?.code ?? 'unknown';
   const message = failedEnvelope.errors[0]?.message ?? 'Unknown error';
   return `Error (${code}): ${message}`;
}

export async function executeCommand(
   args: {
      family: CliCommandFamily;
      subcommand: string;
      wcagVersion: string | undefined;
      json: boolean | undefined;
      verbose?: boolean | undefined;
   },
   handler: () => Promise<CommandExecution> | CommandExecution,
   renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string,
): Promise<void> {
   const startedAt = new Date();

   try {
      const execution = await handler();
      const built = buildSuccessEnvelope(args, execution, startedAt);
      process.exitCode = built.exitCode;
      printOutput({
         json: args.json,
         verbose: args.verbose,
         envelope: built.envelope,
         renderText,
      });
   } catch (error) {
      const built = buildErrorEnvelope(args, error, startedAt);
      process.exitCode = built.exitCode;
      printOutput({
         json: args.json,
         verbose: args.verbose,
         envelope: built.envelope,
         renderText: renderErrorText,
      });
   }
}

export type DriveAction =
   | 'next'
   | 'previous'
   | 'key'
   | 'type'
   | 'interact'
   | 'stop-interacting'
   | 'click-current-item'
   | 'read'
   | 'logs'
   | 'clear-logs'
   | 'checkpoint';

export interface DriveActionCommandInput {
   subcommand: string;
   action: DriveAction;
   options: {
      json?: boolean;
      verbose?: boolean;
      session?: string;
      target?: string;
      ephemeral?: boolean;
   };
   payload: Record<string, unknown> | undefined;
   renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string;
}

async function runDriveAction(input: DriveActionCommandInput): Promise<CommandExecution> {
   const resolved = resolveDriveSession(input.options);

   if (resolved.ephemeral) {
      if (!resolved.target) {
         throw new CliUsageError(
            'missing-target',
            'Target is required for ephemeral actions.',
         );
      }
      const result = await runEphemeralDriverAction(
         resolved.target,
         input.action,
         input.payload,
      );
      return {
         target: { kind: 'driver-target', value: resolved.target },
         result,
      };
   }

   if (!resolved.sessionId) {
      throw new CliUsageError('missing-session', 'Session ID is required.');
   }
   const result = await runDriverSessionAction(
      resolved.sessionId,
      input.action,
      input.payload,
   );
   return {
      target: { kind: 'driver-session', value: resolved.sessionId },
      result,
   };
}

export async function executeDriveActionCommand(
   input: DriveActionCommandInput,
): Promise<void> {
   await executeCommand(
      {
         family: 'drive',
         subcommand: input.subcommand,
         wcagVersion: undefined,
         json: input.options.json,
         verbose: input.options.verbose,
      },
      () => runDriveAction(input),
      input.renderText,
   );
}
