import { cliExitCodes, type Platform } from '@a11lied/contracts';
import type { Command } from 'commander';
import { CliUsageError, verifyCriterion, verifyLevel } from '@a11lied/core';
import {
   addJsonOption,
   addStorybookTargetOptions,
   addTargetOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { executeCommand, parsePlatform, resolveCliTarget } from '../lib/execute.js';
import { buildCliTargetInput, type CliTargetInputOptions } from '../lib/target-input.js';
import { renderVerificationText } from '../renderers/verification.js';

function requireTarget(target: string | undefined): Platform {
   if (!target) {
      throw new CliUsageError(
         'validation-error',
         'Choose one target: virtual, voiceover, or nvda.',
         { field: 'target', value: target },
      );
   }
   return parsePlatform(target);
}

interface CriterionErrorInput {
   row: { criterionId: string; verdict: string } | undefined;
   criterion: string;
   verdict: string;
   ok: boolean;
}

function buildCriterionErrors(
   input: CriterionErrorInput,
): Array<{ code: string; message: string; details: Record<string, unknown> }> {
   if (input.ok) {
      return [];
   }
   return [
      {
         code: 'verification-verdict',
         message: `Criterion ${input.row?.criterionId ?? input.criterion} reported verdict "${input.verdict}".`,
         details: {
            criterionId: input.row?.criterionId ?? input.criterion,
            verdict: input.verdict,
         },
      },
   ];
}

function resolveVerificationExitCode(ok: boolean): number {
   if (ok) {
      return cliExitCodes.success;
   }
   return cliExitCodes.assertion;
}

interface VerifyCommandOptions extends CliTargetInputOptions {
   version: string;
   target?: string;
}

interface VerifyCommandResult {
   ok: boolean;
   exitCode: number;
   warnings: Array<{ code: string; message: string }>;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: Record<string, unknown>;
   result: Record<string, unknown>;
}

async function resolveVerificationContext(options: VerifyCommandOptions): Promise<{
   target: Platform;
   resolved: Awaited<ReturnType<typeof resolveCliTarget>>;
}> {
   const target = requireTarget(options.target);
   const resolved = await resolveCliTarget(buildCliTargetInput(options));
   return { target, resolved };
}

function buildVerifyCommandResult(args: {
   ok: boolean;
   warnings: Array<{ code: string; message: string }>;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: Record<string, unknown>;
   result: Record<string, unknown>;
}): VerifyCommandResult {
   return {
      ok: args.ok,
      exitCode: resolveVerificationExitCode(args.ok),
      warnings: args.warnings,
      errors: args.errors,
      target: args.target,
      result: args.result,
   };
}

async function handleCriterionVerify(
   criterion: string,
   options: VerifyCommandOptions,
): Promise<VerifyCommandResult> {
   const { target, resolved } = await resolveVerificationContext(options);
   const result = await verifyCriterion({
      criterion,
      url: resolved.resolvedUrl,
      target,
      wcagVersion: options.version,
      reportTarget: {
         ...resolved.reportTarget,
         platform: target,
      },
   });
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

function registerCriterionVerifyCommand(verifyCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addTargetOption(
            addWcagVersionOption(
               addStorybookTargetOptions(
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
   ).action(
      async (
         criterion: string,
         options: {
            json?: boolean;
            verbose?: boolean;
            version: string;
            target?: string;
            url?: string;
            storybookUrl?: string;
            storyId?: string;
         },
      ) => {
         await executeCommand(
            {
               family: 'verify',
               subcommand: 'criterion',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleCriterionVerify(criterion, options),
            renderVerificationText,
         );
      },
   );
}

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
   const result = await verifyLevel({
      level,
      url: resolved.resolvedUrl,
      target,
      wcagVersion: options.version,
      reportTarget: {
         ...resolved.reportTarget,
         platform: target,
      },
   });
   const ok = result.summary.failedCount === 0;

   return buildVerifyCommandResult({
      ok,
      warnings: result.warnings,
      errors: buildLevelErrors(level, result.summary.failedCount, ok),
      target: result.target,
      result,
   });
}

function registerLevelVerifyCommand(verifyCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addTargetOption(
            addWcagVersionOption(
               addStorybookTargetOptions(
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
   ).action(
      async (
         level: string,
         options: {
            json?: boolean;
            verbose?: boolean;
            version: string;
            target?: string;
            url?: string;
            storybookUrl?: string;
            storyId?: string;
         },
      ) => {
         await executeCommand(
            {
               family: 'verify',
               subcommand: 'level',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleLevelVerify(level, options),
            renderVerificationText,
         );
      },
   );
}

export function registerVerifyCommands(program: Command): void {
   const verifyCommand = program
      .command('verify')
      .description('Turn collected evidence into explicit WCAG verification results.')
      .configureHelp({ sortOptions: false, sortSubcommands: false });

   registerCriterionVerifyCommand(verifyCommand);
   registerLevelVerifyCommand(verifyCommand);
}
