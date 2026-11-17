import {
   AuditError,
   closeAudit,
   openAudit,
   resolveAuditDir,
   type Audit,
} from '@a11ied/audit';
import type { Command } from 'commander';
import { CliUsageError } from '#core';
import type { CommandExecution } from '../../lib/helpers.js';

export interface AuditBaseOptions {
   audit?: string;
   json?: boolean;
}

export interface AuditCommandSpec<TResult extends Record<string, unknown>> {
   subcommand: string;
   options: AuditBaseOptions;
   /** Produces the command's result. Receives the open audit. */
   work: (audit: Audit) => TResult | Promise<TResult>;
   /** Renders the result for a person or an agent reading plain text. */
   text: (result: TResult) => string;
   /** Sets a non-zero exit code for a result that is not a success. */
   exitCode?: (result: TResult) => number | undefined;
}

/** Adds the options every `a1 audit` subcommand takes. */
export function addAuditOptions(command: Command): Command {
   return command
      .option(
         '--audit <id>',
         'Audit id or directory. Defaults to $A11IED_AUDIT, then the only audit here.',
      )
      .option('--json', 'Print JSON instead of human-readable text.');
}

/** Turns an audit problem into a usage error whose message lists every issue to fix. */
export function toUsageError(error: unknown): unknown {
   if (!(error instanceof AuditError)) {
      return error;
   }
   const lines = error.problems.map((problem) => `  - ${problem}`);
   return new CliUsageError(error.code, [error.message, ...lines].join('\n'), {
      problems: [...error.problems],
   });
}

/** Runs a handler and prints its result through the shared command envelope. */
export async function runCommand<TResult extends Record<string, unknown>>(spec: {
   subcommand: string;
   json: boolean | undefined;
   work: () => TResult | Promise<TResult>;
   text: (result: TResult) => string;
   exitCode?: ((result: TResult) => number | undefined) | undefined;
}): Promise<void> {
   const { executeCommand } = await import('../../lib/execute.js');
   let rendered = '';
   await executeCommand(
      {
         family: 'audit',
         subcommand: spec.subcommand,
         wcagVersion: undefined,
         json: spec.json,
      },
      async (): Promise<CommandExecution> => {
         try {
            const result = await spec.work();
            rendered = spec.text(result);
            const exitCode = spec.exitCode?.(result);
            return exitCode === undefined ? { result } : { result, exitCode };
         } catch (error) {
            throw toUsageError(error);
         }
      },
      () => rendered,
   );
}

/** Opens the selected audit, runs one command against it, and always closes it. */
export async function runAuditCommand<TResult extends Record<string, unknown>>(
   spec: AuditCommandSpec<TResult>,
): Promise<void> {
   await runCommand({
      subcommand: spec.subcommand,
      json: spec.options.json,
      text: spec.text,
      exitCode: spec.exitCode,
      work: async () => {
         const audit = openAudit(resolveAuditDir(spec.options.audit));
         try {
            return await spec.work(audit);
         } finally {
            closeAudit(audit);
         }
      },
   });
}

/** Splits a comma-separated option into trimmed values. */
export function splitList(value: string | undefined): string[] {
   return (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
}

/** Collects a repeatable option into an array. */
export function collect(value: string, previous: string[]): string[] {
   return [...previous, value];
}
