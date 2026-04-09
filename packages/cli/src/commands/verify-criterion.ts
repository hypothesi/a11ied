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
   runCriterionVerification,
   type VerifyCommandOptions,
   type VerifyCommandResult,
} from './verify-shared.js';

function buildCriterionErrors(args: {
   row: { criterionId: string; verdict: string } | undefined;
   criterion: string;
   verdict: string;
   ok: boolean;
}): Array<{ code: string; message: string; details: Record<string, unknown> }> {
   if (args.ok) {
      return [];
   }

   return [
      {
         code: 'verification-verdict',
         message: `Criterion ${args.row?.criterionId ?? args.criterion} reported verdict "${args.verdict}".`,
         details: {
            criterionId: args.row?.criterionId ?? args.criterion,
            verdict: args.verdict,
         },
      },
   ];
}

async function handleCriterionVerify(
   criterion: string,
   options: VerifyCommandOptions,
): Promise<VerifyCommandResult> {
   const { target, resolved } = await resolveVerificationContext(options);
   const result = await runCriterionVerification(
      {
         criterion,
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
   const row = result.criteria[0];
   const verdict = row?.verdict ?? 'error';
   const ok = verdict === 'pass' || verdict === 'not-applicable';

   return buildVerifyCommandResult({
      ok,
      warnings: result.warnings,
      errors: buildCriterionErrors({ row, criterion, verdict, ok }),
      target: result.target,
      result,
   });
}

function buildCriterionCommand(verifyCommand: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addTargetOption(
            addWcagVersionOption(
               addStorybookTargetOptions(
                  addRecordingOption(
                     verifyCommand
                        .command('criterion <criterion>')
                        .description('Verify one WCAG criterion for a target.')
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

export function registerCriterionVerifyCommand(verifyCommand: Command): void {
   buildCriterionCommand(verifyCommand).action(
      async (criterion: string, options: VerifyCommandOptions) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/verification.js'),
         ]);

         await executeCommand(
            {
               family: 'verify',
               subcommand: 'criterion',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleCriterionVerify(criterion, options),
            renderers.renderVerificationText,
         );
      },
   );
}
