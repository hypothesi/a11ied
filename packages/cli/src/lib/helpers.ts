import {
   cliExitCodes,
   cliOutputEnvelopeSchema,
   type CliCommandFamily,
   type CliMessage,
   type CliOutputEnvelope,
} from '@a11lied/contracts';
import { CliEnvironmentError, CliUsageError } from '@a11lied/core';

export const CLI_VERSION = '0.1.0';
export const JSON_INDENT = 2;

export interface CommandExecution {
   ok?: boolean;
   exitCode?: number;
   result: Record<string, unknown> | undefined;
   target?: Record<string, unknown> | undefined;
   warnings?: CliMessage[];
   errors?: CliMessage[];
}

export function notReady(name: string): never {
   throw new Error(
      `${name} is scaffolded but not implemented yet. See plans/a11lied-cli-implementation-plan.md.`,
   );
}

function resolveWcagVersion(version: string | undefined): string | undefined {
   if (version === '2.1' || version === '2.2') {
      return version;
   }
   return undefined;
}

function buildErrorDetail(error: {
   details: Record<string, unknown> | undefined;
}): { details: Record<string, unknown> } | Record<string, never> {
   if (error.details) {
      return { details: error.details };
   }
   return {};
}

function buildCommandObject(args: {
   family: CliCommandFamily;
   subcommand: string;
   wcagVersion: string | undefined;
}): Record<string, unknown> {
   const base: Record<string, unknown> = {
      family: args.family,
      subcommand: args.subcommand,
      version: CLI_VERSION,
   };
   const commandWcagVersion = resolveWcagVersion(args.wcagVersion);
   if (commandWcagVersion) {
      base.wcagVersion = commandWcagVersion;
   }
   return base;
}

export function createEnvelope(args: {
   ok: boolean;
   family: CliCommandFamily;
   subcommand: string;
   wcagVersion: string | undefined;
   target: Record<string, unknown> | undefined;
   result: Record<string, unknown> | undefined;
   warnings: CliMessage[];
   errors: CliMessage[];
   startedAt: Date;
   completedAt: Date;
}): CliOutputEnvelope {
   return cliOutputEnvelopeSchema.parse({
      ok: args.ok,
      command: buildCommandObject(args),
      target: args.target,
      result: args.result,
      warnings: args.warnings,
      errors: args.errors,
      meta: {
         schemaVersion: '1',
         startedAt: args.startedAt.toISOString(),
         completedAt: args.completedAt.toISOString(),
         durationMs: Math.max(0, args.completedAt.getTime() - args.startedAt.getTime()),
      },
   });
}

export interface PrintOutputOptions {
   json: boolean | undefined;
   verbose: boolean | undefined;
   envelope: CliOutputEnvelope;
   renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string;
}

export function printOutput(opts: PrintOutputOptions): void {
   if (opts.json) {
      process.stdout.write(`${JSON.stringify(opts.envelope, undefined, JSON_INDENT)}\n`);
      return;
   }

   process.stdout.write(
      `${opts.renderText(opts.envelope, { verbose: Boolean(opts.verbose) })}\n`,
   );
}

function buildCliUsageErrors(error: CliUsageError): {
   exitCode: number;
   errors: CliMessage[];
} {
   return {
      exitCode: error.exitCode,
      errors: [
         {
            code: error.code,
            message: error.message,
            ...buildErrorDetail(error),
         },
      ],
   };
}

function buildEnvironmentErrors(error: CliEnvironmentError): {
   exitCode: number;
   errors: CliMessage[];
} {
   return {
      exitCode: error.exitCode,
      errors: [
         {
            code: error.code,
            message: error.message,
            ...buildErrorDetail(error),
         },
      ],
   };
}

function buildGenericError(message: string): { exitCode: number; errors: CliMessage[] } {
   return {
      exitCode: cliExitCodes.internal,
      errors: [{ code: 'internal-error', message }],
   };
}

export function normalizeError(error: unknown): {
   exitCode: number;
   errors: CliMessage[];
} {
   if (error instanceof CliUsageError) {
      return buildCliUsageErrors(error);
   }

   if (error instanceof CliEnvironmentError) {
      return buildEnvironmentErrors(error);
   }

   if (error instanceof Error) {
      return buildGenericError(error.message);
   }

   return buildGenericError(String(error));
}
