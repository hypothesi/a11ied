import {
   cliExitCodes,
   type CliCommandFamily,
   type CliOutputEnvelope,
   type Platform,
} from '#contracts';
import {
   CliUsageError,
   resolveDefaultTarget,
   runDriverSessionAction,
   runEphemeralDriverAction,
} from '#core';
import {
   type CommandExecution,
   createEnvelope,
   normalizeError,
   printOutput,
} from './helpers.js';
import { resolveDriveSession } from './resolvers.js';

export { parsePlatform, resolveOptionalCliTarget } from './resolvers.js';
// Fallow-ignore-next-line unused-export
export { resolveCliTarget } from './resolvers.js';
// Fallow-ignore-next-line unused-export
export { resolveRunAxeSelection } from './resolvers.js';

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

// Fallow-ignore-next-line unused-export
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

type DriveAction =
   | 'next'
   | 'previous'
   | 'key'
   | 'type'
   | 'perform'
   | 'interact'
   | 'stop-interacting'
   | 'click-current-item'
   | 'read'
   | 'logs'
   | 'clear-logs'
   | 'checkpoint'
   | 'focus';

interface DriveActionCommandInput {
   subcommand: string;
   action: DriveAction;
   options: {
      json?: boolean;
      verbose?: boolean;
      session?: string;
      target?: string;
      ephemeral?: boolean;
      allowVirtual?: boolean;
   };
   payload: Record<string, unknown> | undefined;
   renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string;
}

function resolveEphemeralTarget(resolved: { target?: Platform }): {
   target: Platform;
   warnings?: Array<{ code: string; message: string }>;
} {
   if (resolved.target) {
      return { target: resolved.target };
   }

   const fallback = resolveDefaultTarget();
   const warnings: Array<{ code: string; message: string }> = [
      {
         code: 'default-target-selected',
         message: fallback.message,
      },
   ];
   if (fallback.warning) {
      warnings.push({
         code: 'virtual-target-simulation-warning',
         message: fallback.warning,
      });
   }
   return { target: fallback.target, warnings };
}

async function runEphemeralAction(
   input: DriveActionCommandInput,
   resolved: { target?: Platform },
): Promise<CommandExecution> {
   const { target, warnings } = resolveEphemeralTarget(resolved);
   let actionOptions: { payload: Record<string, unknown> } | undefined = undefined;
   if (input.payload) {
      actionOptions = { payload: input.payload };
   }
   const result = await runEphemeralDriverAction(target, input.action, actionOptions);
   const execution: CommandExecution = {
      target: { kind: 'driver-target', value: target },
      result,
   };
   if (warnings) {
      execution.warnings = warnings;
   }
   return execution;
}

async function runDriveAction(input: DriveActionCommandInput): Promise<CommandExecution> {
   const resolved = resolveDriveSession(input.options);

   if (resolved.ephemeral) {
      return runEphemeralAction(input, resolved);
   }

   if (!resolved.sessionId) {
      throw new CliUsageError('missing-session', 'Session ID is required.');
   }
   let actionOptions: { payload: Record<string, unknown> } | undefined = undefined;
   if (input.payload) {
      actionOptions = { payload: input.payload };
   }
   const result = await runDriverSessionAction(
      resolved.sessionId,
      input.action,
      actionOptions,
   );
   return {
      target: { kind: 'driver-session', value: resolved.sessionId },
      result,
   };
}

// Fallow-ignore-next-line unused-export
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
