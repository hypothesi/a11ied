import type { Command } from 'commander';
import { inspectApplicableTarget, inspectCriterionTarget } from '@a11lied/core';
import {
   addJsonOption,
   addStorybookTargetOptions,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { executeCommand, resolveCliTarget } from '../lib/execute.js';
import { buildCliTargetInput } from '../lib/target-input.js';
import {
   renderApplicableText,
   renderCriterionApplicabilityText,
} from '../renderers/index.js';

interface InspectOptions {
   json?: boolean;
   verbose?: boolean;
   version: string;
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}

async function handleApplicableAction(options: InspectOptions): Promise<void> {
   await executeCommand(
      {
         family: 'inspect',
         subcommand: 'applicable',
         wcagVersion: options.version,
         json: options.json,
         verbose: options.verbose,
      },
      async () => {
         const targetInput = buildCliTargetInput(options);
         const resolved = await resolveCliTarget(targetInput);
         const result = await inspectApplicableTarget(targetInput, options.version);
         return {
            target: resolved.reportTarget,
            result: result as unknown as Record<string, unknown>,
         };
      },
      renderApplicableText,
   );
}

function registerApplicableCommand(inspectCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            addStorybookTargetOptions(
               inspectCommand
                  .command('applicable')
                  .description('List criteria that look relevant for a target.')
                  .option('--url <url>', 'Inspect a live URL target.'),
            ),
         ),
      ),
   ).action(async (options: InspectOptions) => {
      await handleApplicableAction(options);
   });
}

async function handleCriterionAction(
   criterion: string,
   options: InspectOptions,
): Promise<void> {
   await executeCommand(
      {
         family: 'inspect',
         subcommand: 'criterion',
         wcagVersion: options.version,
         json: options.json,
         verbose: options.verbose,
      },
      async () => {
         const targetInput = buildCliTargetInput(options);
         const resolved = await resolveCliTarget(targetInput);
         const result = await inspectCriterionTarget(
            criterion,
            targetInput,
            options.version,
         );
         return {
            target: resolved.reportTarget,
            result: result as unknown as Record<string, unknown>,
         };
      },
      renderCriterionApplicabilityText,
   );
}

function registerCriterionInspectCommand(inspectCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            addStorybookTargetOptions(
               inspectCommand
                  .command('criterion <criterion>')
                  .description('Explain one criterion for a target.')
                  .option('--url <url>', 'Inspect a live URL target.'),
            ),
         ),
      ),
   ).action(async (criterion: string, options: InspectOptions) => {
      await handleCriterionAction(criterion, options);
   });
}

export function registerInspectCommands(program: Command): void {
   const inspectCommand = program
      .command('inspect')
      .description('Explain criterion applicability for a target.');

   registerApplicableCommand(inspectCommand);
   registerCriterionInspectCommand(inspectCommand);
}
