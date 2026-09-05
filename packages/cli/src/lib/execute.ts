import {
   cliExitCodes,
   type CliCommandFamily,
   type CliMessage,
   type CliOutputEnvelope,
   type DriverActionRequest,
   type Platform,
} from '#contracts';
import {
   CliUsageError,
   getActiveDriverSession,
   resolveAvailableDefaultTarget,
   resolveDriverMode,
   runDriverSessionAction,
   runEphemeralDriverAction,
   startDriverSession,
} from '#core';
import { parseTimeoutMs, type DriveAutoStartOptions } from '../commands/drive-options.js';
import { errorLine } from './format.js';
import {
   type CommandExecution,
   createEnvelope,
   normalizeError,
   printOutput,
} from './helpers.js';
import { buildVirtualTargetGuardOptions, parsePlatform } from './resolvers.js';

export { parsePlatform, resolveOptionalCliTarget } from './resolvers.js';
// Fallow-ignore-next-line unused-export
export { resolveCliTarget } from './resolvers.js';
// Fallow-ignore-next-line unused-export
export { resolveRunAxeSelection } from './resolvers.js';

type RenderText = (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string;

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
   return errorLine(code, message);
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
   renderText: RenderText,
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

/** Raised by every sr verb that needs a session when none is active. */
export function createNoSessionError(): CliUsageError {
   return new CliUsageError(
      'missing-session',
      'No active screen reader session. Start one with "a1 sr start".',
   );
}

/** Builds the warnings that explain which screen reader was chosen when --sr was omitted. */
export function buildDefaultTargetWarnings(
   fallback: Awaited<ReturnType<typeof resolveAvailableDefaultTarget>>,
): CliMessage[] {
   const warnings: CliMessage[] = [
      { code: 'default-target-selected', message: fallback.message },
   ];
   if (fallback.warning) {
      warnings.push({ code: 'virtual-target-simulation-warning', message: fallback.warning });
   }
   return warnings;
}

/** Resolves --sr and --allow-virtual to a target, defaulting to the platform reader. */
export async function resolveScreenReaderTarget(options: {
   sr?: string | undefined;
   allowVirtual?: boolean | undefined;
}): Promise<{ target: Platform; warnings: CliMessage[] }> {
   if (options.sr) {
      return {
         target: parsePlatform(options.sr, buildVirtualTargetGuardOptions(options.allowVirtual)),
         warnings: [],
      };
   }
   const fallback = await resolveAvailableDefaultTarget();
   return { target: fallback.target, warnings: buildDefaultTargetWarnings(fallback) };
}

interface DriveActionCommandInput {
   subcommand: string;
   request: DriverActionRequest;
   autoStart?: boolean;
   options: DriveAutoStartOptions;
   renderText: RenderText;
}

function renderPhraseText(envelope: CliOutputEnvelope): string {
   const result = envelope.result;
   if (!result || typeof result.state !== 'object' || result.state === null) {
      return '';
   }
   const phrase = 'lastSpokenPhrase' in result.state ? result.state.lastSpokenPhrase : '';
   return typeof phrase === 'string' ? phrase : '';
}

async function runEphemeral(input: DriveActionCommandInput): Promise<CommandExecution> {
   const { target, warnings } = await resolveScreenReaderTarget(input.options);
   const result = await runEphemeralDriverAction({
      target,
      request: input.request,
      timeoutMs: parseTimeoutMs(input.options.timeout),
   });
   return { target: { kind: 'driver-target', value: target }, result, warnings };
}

async function runAutoStart(input: DriveActionCommandInput): Promise<CommandExecution> {
   const { target, warnings } = await resolveScreenReaderTarget(input.options);
   const started = await startDriverSession({ target, mode: resolveDriverMode() });
   const result = await runDriverSessionAction(input.request, {
      timeoutMs: parseTimeoutMs(input.options.timeout),
   });
   warnings.push({
      code: 'session-auto-started',
      message: `No session was active, so a ${started.session.target} session was started.`,
   });
   return { target: { kind: 'driver-session', value: target }, result, warnings };
}

async function runDriveAction(input: DriveActionCommandInput): Promise<CommandExecution> {
   if (input.options.ephemeral) {
      return runEphemeral(input);
   }
   const session = await getActiveDriverSession();
   if (!session) {
      if (input.autoStart) {
         return runAutoStart(input);
      }
      throw createNoSessionError();
   }
   const warnings: CliMessage[] = [];
   if (input.options.sr && input.options.sr !== session.target) {
      warnings.push({
         code: 'session-target-ignored',
         message: `A ${session.target} session is active; --sr ${input.options.sr} only applies when a session has to be started.`,
      });
   }
   const result = await runDriverSessionAction(input.request, {
      timeoutMs: parseTimeoutMs(input.options.timeout),
   });
   return { target: { kind: 'driver-session', value: session.target }, result, warnings };
}

// Fallow-ignore-next-line unused-export
export async function executeDriveActionCommand(
   input: DriveActionCommandInput,
): Promise<void> {
   await executeCommand(
      {
         family: 'sr',
         subcommand: input.subcommand,
         wcagVersion: undefined,
         json: input.options.json,
         verbose: input.options.verbose,
      },
      () => runDriveAction(input),
      input.options.phrase ? renderPhraseText : input.renderText,
   );
}
