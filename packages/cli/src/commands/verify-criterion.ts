import type { Command } from 'commander';
import type { Platform } from '#contracts';
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
import type { ResolvedCliTarget } from '../lib/resolvers.js';

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

function buildCriterionVerifyOptions(args: {
   criterion: string;
   resolved: ResolvedCliTarget;
   target: Platform;
   defaulted: boolean;
   wcagVersion: string;
}): Parameters<typeof runCriterionVerification>[0] {
   const verifyOptions: Parameters<typeof runCriterionVerification>[0] = {
      criterion: args.criterion,
      url: args.resolved.resolvedUrl,
      wcagVersion: args.wcagVersion,
      reportTarget: {
         ...args.resolved.reportTarget,
         platform: args.target,
      },
   };
   if (!args.defaulted) {
      verifyOptions.target = args.target;
   }
   return verifyOptions;
}

function resolveCriterionVerdict(
   result: Awaited<ReturnType<typeof runCriterionVerification>>,
): {
   row: { criterionId: string; verdict: string } | undefined;
   verdict: string;
   ok: boolean;
} {
   const row = result.criteria[0];
   const verdict = row?.verdict ?? 'error';
   const ok = verdict === 'pass' || verdict === 'not-applicable';
   return { row, verdict, ok };
}

async function handleCriterionVerify(
   criterion: string,
   options: VerifyCommandOptions,
): Promise<VerifyCommandResult> {
   const { target, resolved, defaulted, warning } = await resolveVerificationContext(options);
   const verifyOptions = buildCriterionVerifyOptions({
      criterion,
      resolved,
      target,
      defaulted,
      wcagVersion: options.version,
   });
   const result = await runCriterionVerification(verifyOptions, options.recording);
   const { row, verdict, ok } = resolveCriterionVerdict(result);

   const warnings = [...result.warnings];
   if (warning) {
      warnings.push({ code: 'virtual-target-simulation-warning', message: warning });
   }

   return buildVerifyCommandResult({
      ok,
      warnings,
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
