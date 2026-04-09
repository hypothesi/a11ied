import type { Command } from 'commander';
import {
   addJsonOption,
   addRecordingOption,
   addStorybookTargetOptions,
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

async function handleLevelVerify(
   level: string,
   options: VerifyCommandOptions,
): Promise<VerifyCommandResult> {
   const { target, resolved } = await resolveVerificationContext(options);
   const result = await runLevelVerification(
      {
         level,
         url: resolved.resolvedUrl,
         target,
         wcagVersion: options.version,
         reportTarget: {
            ...resolved.reportTarget,
            platform: target,
         },
      },
      options.recording,
   );
   const ok = result.summary.failedCount === 0;

   return buildVerifyCommandResult({
      ok,
      warnings: result.warnings,
      errors: buildLevelErrors(level, result.summary.failedCount, ok),
      target: result.target,
      result,
   });
}

function buildLevelCommand(verifyCommand: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addTargetOption(
            addWcagVersionOption(
               addStorybookTargetOptions(
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
