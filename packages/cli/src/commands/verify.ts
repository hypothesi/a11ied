import type { Command } from 'commander';
import type { VerifyCriterionOptions, VerifyLevelOptions } from '#core';
import {
   addJsonOption,
   addVerboseOption,
   addWcagVersionOption,
   addTargetOption,
   addAllowVirtualOption,
   addRecordingOption,
} from '../lib/options.js';

interface VerifyOptions {
   json?: boolean;
   verbose?: boolean;
   version: string;
   url?: string;
   target?: string;
   allowVirtual?: boolean;
   recording?: string;
}

async function handleCriterionVerifyAction(
   criterion: string,
   options: VerifyOptions,
): Promise<void> {
   const [
      { executeCommand, resolveCliTarget },
      { buildCliTargetInput },
      renderers,
      core,
   ] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('../renderers/index.js'),
      import('#core'),
   ]);

   await executeCommand(
      {
         family: 'verify',
         subcommand: 'criterion',
         wcagVersion: options.version,
         json: options.json,
         verbose: options.verbose,
      },
      async () => {
         const targetInput = buildCliTargetInput(options);
         const resolved = await resolveCliTarget(targetInput);
         const verifyOpts: VerifyCriterionOptions = {
            criterion,
            url: resolved.resolvedUrl,
            wcagVersion: options.version,
            reportTarget: resolved.reportTarget,
         };
         if (options.target !== undefined) {
            verifyOpts.target = options.target;
         }
         if (options.recording !== undefined) {
            verifyOpts.recordingPath = options.recording;
         }
         const result = await core.verifyCriterion(verifyOpts);
         return {
            target: resolved.reportTarget,
            result: result as unknown as Record<string, unknown>,
         };
      },
      renderers.renderVerificationReportText,
   );
}

function registerCriterionVerifyCommand(verifyCommand: Command): void {
   addRecordingOption(
      addAllowVirtualOption(
         addTargetOption(
            addVerboseOption(
               addJsonOption(
                  addWcagVersionOption(
                     verifyCommand
                        .command('criterion <criterion>')
                        .description('Verify one WCAG criterion against a target.')
                        .option('--url <url>', 'Verify a live URL target.'),
                  ),
               ),
            ),
         ),
      ),
   ).action(async (criterion: string, options: VerifyOptions) => {
      await handleCriterionVerifyAction(criterion, options);
   });
}

async function handleLevelVerifyAction(
   level: string,
   options: VerifyOptions,
): Promise<void> {
   const [
      { executeCommand, resolveCliTarget },
      { buildCliTargetInput },
      renderers,
      core,
   ] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('../renderers/index.js'),
      import('#core'),
   ]);

   await executeCommand(
      {
         family: 'verify',
         subcommand: 'level',
         wcagVersion: options.version,
         json: options.json,
         verbose: options.verbose,
      },
      async () => {
         const targetInput = buildCliTargetInput(options);
         const resolved = await resolveCliTarget(targetInput);
         const verifyOpts: VerifyLevelOptions = {
            level,
            url: resolved.resolvedUrl,
            wcagVersion: options.version,
            reportTarget: resolved.reportTarget,
         };
         if (options.target !== undefined) {
            verifyOpts.target = options.target;
         }
         if (options.recording !== undefined) {
            verifyOpts.recordingPath = options.recording;
         }
         const result = await core.verifyLevel(verifyOpts);
         return {
            target: resolved.reportTarget,
            result: result as unknown as Record<string, unknown>,
         };
      },
      renderers.renderVerificationReportText,
   );
}

function registerLevelVerifyCommand(verifyCommand: Command): void {
   addRecordingOption(
      addAllowVirtualOption(
         addTargetOption(
            addVerboseOption(
               addJsonOption(
                  addWcagVersionOption(
                     verifyCommand
                        .command('level <level>')
                        .description('Verify conformance level against a target.')
                        .option('--url <url>', 'Verify a live URL target.'),
                  ),
               ),
            ),
         ),
      ),
   ).action(async (level: string, options: VerifyOptions) => {
      await handleLevelVerifyAction(level, options);
   });
}

export function registerVerifyCommands(program: Command): void {
   const verifyCommand = program
      .command('verify')
      .description(
         'Turn collected evidence into explicit WCAG criterion or level verdicts.',
      );

   registerCriterionVerifyCommand(verifyCommand);
   registerLevelVerifyCommand(verifyCommand);
}
