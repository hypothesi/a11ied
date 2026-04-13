import type { Command } from 'commander';
import {
   addAllowVirtualOption,
   addJsonOption,
   addRecordingOption,
   addTargetOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import {
   buildVerifyCommandResult,
   resolveVerificationContext,
   runLevelVerification,
   type VerifyCommandOptions,
   type VerifyCommandResult,
} from './verify-shared.js';

type VerificationContext = Awaited<ReturnType<typeof resolveVerificationContext>>;

function buildLevelErrors(
   level: string,
   failedCount: number,
   ok: boolean,
): Array<{ code: string; message: string; details: Record<string, unknown> }> {
   if (ok) {
      return [];
   }

   return [
      {
         code: 'verification-level-summary',
         message: `Level ${level} reported ${failedCount} non-passing criterion verdict(s).`,
         details: { level, failedCount },
      },
   ];
}

function buildLevelVerifyOptions(
   level: string,
   options: VerifyCommandOptions,
   context: VerificationContext,
): Parameters<typeof runLevelVerification>[0] {
   const verifyOptions: Parameters<typeof runLevelVerification>[0] = {
      level,
      url: context.resolved.resolvedUrl,
      wcagVersion: options.version,
      reportTarget: {
         ...context.resolved.reportTarget,
         platform: context.target,
      },
   };
   if (!context.defaulted) {
      verifyOptions.target = context.target;
   }
   return verifyOptions;
}

function buildLevelWarnings(
   warnings: VerifyCommandResult['warnings'],
   warning: VerificationContext['warning'],
): VerifyCommandResult['warnings'] {
   if (!warning) {
      return warnings;
   }
   return [...warnings, { code: 'virtual-target-simulation-warning', message: warning }];
}

async function handleLevelVerify(
   level: string,
   options: VerifyCommandOptions,
): Promise<VerifyCommandResult> {
   const context = await resolveVerificationContext(options);
   const verifyOptions = buildLevelVerifyOptions(level, options, context);
   const result = await runLevelVerification(verifyOptions, options.recording);
   const ok = result.summary.failedCount === 0;

   const warnings = buildLevelWarnings(result.warnings, context.warning);

   return buildVerifyCommandResult({
      ok,
      warnings,
      errors: buildLevelErrors(level, result.summary.failedCount, ok),
      target: result.target,
      result,
   });
}

function buildLevelCommand(verifyCommand: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addAllowVirtualOption(
            addTargetOption(
               addWcagVersionOption(
                  addRecordingOption(
                     verifyCommand
                        .command('level <level>')
                        .description('Verify a WCAG conformance level against a target.')
                        .option(
                           '--url <url>',
                           'Run the verification against one live URL target.',
                        ),
                  ),
               ),
            ),
         ),
      ),
   );
}

export function registerLevelVerifyCommand(verifyCommand: Command): void {
   buildLevelCommand(verifyCommand).action(
      async (level: string, options: VerifyCommandOptions) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/verification.js'),
         ]);

         await executeCommand(
            {
               family: 'verify',
               subcommand: 'level',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleLevelVerify(level, options),
            renderers.renderVerificationText,
         );
      },
   );
}
