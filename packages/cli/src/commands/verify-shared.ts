import {
   cliExitCodes,
   type Platform,
   type VerificationReport,
   type VerificationTarget,
} from '#contracts';
import type { CliTargetInputOptions } from '../lib/target-input.js';
import type { ResolvedCliTarget } from '../lib/resolvers.js';

export interface VerifyCommandOptions extends CliTargetInputOptions {
   version: string;
   target?: string;
   recording?: string;
   json?: boolean;
   verbose?: boolean;
}

export interface VerifyCommandResult {
   ok: boolean;
   exitCode: number;
   warnings: Array<{ code: string; message: string }>;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: Record<string, unknown>;
   result: Record<string, unknown>;
}

export async function requireTarget(target: string | undefined): Promise<Platform> {
   if (!target) {
      const { CliUsageError, resolveDefaultTarget } = await import('#core');
      const fallback = resolveDefaultTarget();
      throw new CliUsageError(
         'validation-error',
         `${fallback.message} Provide --target to override.`,
         { field: 'target', value: target, defaultTarget: fallback.target },
      );
   }

   const { parsePlatform } = await import('../lib/execute.js');
   return parsePlatform(target);
}

export async function resolveVerificationContext(options: VerifyCommandOptions): Promise<{
   target: Platform;
   resolved: ResolvedCliTarget;
}> {
   const [{ resolveCliTarget }, { buildCliTargetInput }] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
   ]);

   const target = await requireTarget(options.target);
   const resolved = await resolveCliTarget(buildCliTargetInput(options));

   return { target, resolved };
}

export function buildVerifyCommandResult(args: {
   ok: boolean;
   warnings: Array<{ code: string; message: string }>;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: Record<string, unknown>;
   result: Record<string, unknown>;
}): VerifyCommandResult {
   let exitCode: number = cliExitCodes.assertion;
   if (args.ok) {
      exitCode = cliExitCodes.success;
   }

   return {
      ok: args.ok,
      exitCode,
      warnings: args.warnings,
      errors: args.errors,
      target: args.target,
      result: args.result,
   };
}

export async function runCriterionVerification(
   verifyOptions: {
      criterion: string;
      url: string;
      target: Platform;
      wcagVersion: string;
      reportTarget: VerificationTarget;
   },
   recordingPath?: string,
): Promise<VerificationReport> {
   const { verifyCriterion } = await import('#core');

   if (recordingPath) {
      return verifyCriterion({
         ...verifyOptions,
         recordingPath,
      });
   }

   return verifyCriterion(verifyOptions);
}

export async function runLevelVerification(
   verifyOptions: {
      level: string;
      url: string;
      target: Platform;
      wcagVersion: string;
      reportTarget: VerificationTarget;
   },
   recordingPath?: string,
): Promise<VerificationReport> {
   const { verifyLevel } = await import('#core');

   if (recordingPath) {
      return verifyLevel({
         ...verifyOptions,
         recordingPath,
      });
   }

   return verifyLevel(verifyOptions);
}
