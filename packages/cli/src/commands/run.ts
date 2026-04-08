import { cliExitCodes } from '@a11lied/contracts';
import type { Command } from 'commander';
import { runAxe, runInteractionPattern } from '@a11lied/core';
import {
   addJsonOption,
   addSessionOption,
   addStorybookTargetOptions,
   addTargetOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { buildCliTargetInput } from '../lib/target-input.js';
import {
   executeCommand,
   parsePlatform,
   resolveCliTarget,
   resolveRunAxeSelection,
} from '../lib/execute.js';
import { renderPatternText, renderRunAxeText } from '../renderers/index.js';

async function runAxeForSelection(
   url: string,
   selection:
      | { kind: 'criterion'; criterion: string }
      | { kind: 'level'; level: string }
      | { kind: 'rule'; ruleIds: string[] },
   wcagVersion: string,
): Promise<Record<string, unknown>> {
   if (selection.kind === 'criterion') {
      return runAxe(url, { url, wcagVersion, criterion: selection.criterion });
   }
   if (selection.kind === 'level') {
      return runAxe(url, { url, wcagVersion, level: selection.level });
   }
   return runAxe(url, { url, wcagVersion, ruleIds: selection.ruleIds });
}

async function handleAxeAction(options: {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
   version: string;
   criterion?: string;
   level?: string;
   rule?: string[];
}): Promise<{
   target: { kind: string; value: string };
   result: Record<string, unknown>;
}> {
   const resolved = await resolveCliTarget(buildCliTargetInput(options));
   const selection = resolveRunAxeSelection(options);
   const result = await runAxeForSelection(
      resolved.resolvedUrl,
      selection,
      options.version,
   );
   return { target: resolved.reportTarget, result };
}

function registerAxeCommand(runCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            addStorybookTargetOptions(
               runCommand
                  .command('axe')
                  .description('Run axe-core against a target.')
                  .option('--url <url>', 'Run against one live URL target.')
                  .option('--level <level>', 'Limit the run to one WCAG level.')
                  .option(
                     '--criterion <criterion>',
                     'Limit the run to one WCAG criterion id or slug.',
                  )
                  .option(
                     '--rule <ruleId...>',
                     'Limit the run to one or more explicit axe rule ids.',
                  ),
            ),
         ),
      ),
   ).action(
      async (options: {
         json?: boolean;
         verbose?: boolean;
         version: string;
         url?: string;
         storybookUrl?: string;
         storyId?: string;
         level?: string;
         criterion?: string;
         rule?: string[];
      }) => {
         await executeCommand(
            {
               family: 'run',
               subcommand: 'axe',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleAxeAction(options),
            renderRunAxeText,
         );
      },
   );
}

function buildPatternErrors(result: {
   assertions: Array<{ id: string; status: string }>;
}): Array<{ code: string; message: string; details: { failedAssertionIds: string[] } }> {
   const hasFailed = result.assertions.some((entry) => entry.status === 'failed');
   if (!hasFailed) {
      return [];
   }
   return [
      {
         code: 'pattern-assertion-failed',
         message: 'One or more pattern assertions failed.',
         details: {
            failedAssertionIds: result.assertions
               .filter((entry) => entry.status === 'failed')
               .map((entry) => entry.id),
         },
      },
   ];
}

function resolvePatternTarget(options: { target?: string; session?: string }): {
   parsedTarget: ReturnType<typeof parsePlatform> | undefined;
} {
   if (options.target) {
      return { parsedTarget: parsePlatform(options.target) };
   }
   return { parsedTarget: undefined };
}

function resolvePatternExitCode(hasFailed: boolean): number {
   if (hasFailed) {
      return cliExitCodes.assertion;
   }
   return cliExitCodes.success;
}

function buildPatternInput(
   patternId: string,
   options: { url: string; target?: string; session?: string },
): Record<string, unknown> {
   const { parsedTarget } = resolvePatternTarget(options);
   const input: Record<string, unknown> = {
      patternId,
      url: options.url,
   };
   if (parsedTarget) {
      input.target = parsedTarget;
   }
   if (options.session) {
      input.sessionId = options.session;
   }
   return input;
}

async function handlePatternAction(
   patternId: string,
   options: {
      url?: string;
      storybookUrl?: string;
      storyId?: string;
      target?: string;
      session?: string;
   },
): Promise<{
   ok: boolean;
   exitCode: number;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: { kind: string; value: string };
   result: Record<string, unknown>;
}> {
   const resolved = await resolveCliTarget(buildCliTargetInput(options));
   const patternOptions: {
      url: string;
      target?: string;
      session?: string;
   } = {
      url: resolved.resolvedUrl,
   };
   if (options.target) {
      patternOptions.target = options.target;
   }
   if (options.session) {
      patternOptions.session = options.session;
   }
   const input = buildPatternInput(patternId, patternOptions);
   const result = await runInteractionPattern(
      input as unknown as Parameters<typeof runInteractionPattern>[0],
   );

   const hasFailed = result.assertions.some((entry) => entry.status === 'failed');

   return {
      ok: !hasFailed,
      exitCode: resolvePatternExitCode(hasFailed),
      errors: buildPatternErrors(result),
      target: resolved.reportTarget,
      result,
   };
}

function registerPatternCommand(runCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addTargetOption(
            addSessionOption(
               addStorybookTargetOptions(
                  runCommand
                     .command('pattern <patternId>')
                     .description('Run a named built-in interaction pattern.')
                     .option(
                        '--url <url>',
                        'Run the pattern against one live URL target.',
                     ),
               ),
            ),
         ),
      ),
   ).action(
      async (
         patternId: string,
         options: {
            json?: boolean;
            verbose?: boolean;
            url?: string;
            storybookUrl?: string;
            storyId?: string;
            target?: string;
            session?: string;
         },
      ) => {
         await executeCommand(
            {
               family: 'run',
               subcommand: 'pattern',
               wcagVersion: undefined,
               json: options.json,
               verbose: options.verbose,
            },
            () => handlePatternAction(patternId, options),
            renderPatternText,
         );
      },
   );
}

export function registerRunCommands(program: Command): void {
   const runCommand = program
      .command('run')
      .description('Execute automated rule scans and named interaction patterns.')
      .configureHelp({ sortOptions: false, sortSubcommands: false });

   registerAxeCommand(runCommand);
   registerPatternCommand(runCommand);
}
