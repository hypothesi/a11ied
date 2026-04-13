import {
   cliExitCodes,
   type Platform,
   type VerificationReport,
   type VerificationTarget,
} from '#contracts';
import type { CliTargetInputOptions } from '../lib/target-input.js';
import {
   buildVirtualTargetGuardOptions,
   type ResolvedCliTarget,
} from '../lib/resolvers.js';

export interface VerifyCommandOptions extends CliTargetInputOptions {
   version: string;
   target?: string;
   recording?: string;
   allowVirtual?: boolean;
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

async function resolveTarget(
   target: string | undefined,
   options?: { allowVirtual?: boolean },
): Promise<{ target: Platform; defaulted: boolean; warning?: string }> {
   if (!target) {
      const { resolveDefaultTarget } = await import('#core');
      const fallback = resolveDefaultTarget();
      const result: { target: Platform; defaulted: boolean; warning?: string } = {
         target: fallback.target,
         defaulted: true,
      };
      if (fallback.warning) {
         result.warning = fallback.warning;
      }
      return result;
   }

   const { parsePlatform } = await import('../lib/execute.js');
   return {
      target: parsePlatform(
         target,
         buildVirtualTargetGuardOptions(options?.allowVirtual),
      ),
      defaulted: false,
   };
}

export async function resolveVerificationContext(options: VerifyCommandOptions): Promise<{
   target: Platform;
   resolved: ResolvedCliTarget;
   defaulted: boolean;
   warning?: string;
}> {
   const [{ resolveCliTarget }, { buildCliTargetInput }] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
   ]);

   const { target, defaulted, warning } = await resolveTarget(
      options.target,
      buildVirtualTargetGuardOptions(options.allowVirtual),
   );
   const resolved = await resolveCliTarget(buildCliTargetInput(options));

   const result: {
      target: Platform;
      resolved: ResolvedCliTarget;
      defaulted: boolean;
      warning?: string;
   } = {
      target,
      resolved,
      defaulted,
   };
   if (warning) {
      result.warning = warning;
   }
   return result;
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
      target?: Platform;
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
      target?: Platform;
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
