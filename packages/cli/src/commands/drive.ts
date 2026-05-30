import { log } from '@clack/prompts';
import type { Command } from 'commander';
import type * as Core from '#core';
import type { Platform } from '#contracts';
import type { resolveOptionalCliTarget } from '../lib/execute.js';
import type { CommandExecution } from '../lib/helpers.js';
import {
   addAllowVirtualOption,
   addJsonOption,
   addRecordingOption,
   addSessionOption,
   addVerboseOption,
} from '../lib/options.js';
import type { buildCliTargetInput, CliTargetInputOptions } from '../lib/target-input.js';
import {
   buildVirtualTargetGuardOptions,
   type ResolvedCliTarget,
} from '../lib/resolvers.js';
import { persistImplicitDriveSession } from '../lib/drive-session.js';
import { executeStopAction } from './drive-stop.js';
import { executeStatusAction } from './drive-status.js';
import {
   registerMiddleActions,
   registerSimpleActions,
   registerTrailingActions,
} from './drive-actions.js';

interface StartActionOptions extends CliTargetInputOptions {
   json?: boolean;
   target?: string;
   recording?: string;
   allowVirtual?: boolean;
}

const REAL_BROWSER_LAUNCH_DELAY_MS = 1000;
const REAL_BROWSER_FOCUS_DELAY_MS = 750;

function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(() => resolvePromise(), ms);
   });
}

function emitDefaultTargetNotice(
   fallback: Awaited<ReturnType<typeof Core.resolveAvailableDefaultTarget>>,
   json: boolean | undefined,
): void {
   if (json) {
      return;
   }
   log.message(fallback.message);
   if (fallback.warning) {
      log.warn(fallback.warning);
   }
}

function buildDefaultTargetWarnings(
   fallback: Awaited<ReturnType<typeof Core.resolveAvailableDefaultTarget>>,
): Array<{ code: string; message: string }> {
   const warnings: Array<{ code: string; message: string }> = [
      {
         code: 'default-target-selected',
         message: fallback.message,
      },
   ];
   if (fallback.warning) {
      warnings.push({
         code: 'virtual-target-simulation-warning',
         message: fallback.warning,
      });
   }
   return warnings;
}

async function applyDefaultDriverTarget(
   options: StartActionOptions,
   core: typeof Core,
): Promise<{ warnings?: Array<{ code: string; message: string }> }> {
   if (options.target) {
      return {};
   }

   const fallback = await core.resolveAvailableDefaultTarget();
   emitDefaultTargetNotice(fallback, options.json);
   options.target = fallback.target;
   if (fallback.target === 'virtual') {
      options.allowVirtual = true;
   }
   return { warnings: buildDefaultTargetWarnings(fallback) };
}

async function startDriverSessionForTarget(args: {
   options: StartActionOptions;
   parsePlatform: (
      target: string | undefined,
      options?: { allowVirtual?: boolean },
   ) => Platform;
   core: typeof Core;
}): Promise<Awaited<ReturnType<typeof Core.startDriverSession>>> {
   const guardOptions = buildVirtualTargetGuardOptions(args.options.allowVirtual);
   return args.core.startDriverSession(
      args.parsePlatform(args.options.target, guardOptions),
      process.cwd(),
      args.options.recording,
   );
}

async function resolveStartTarget(args: {
   options: StartActionOptions;
   resolveOptionalCliTarget: typeof resolveOptionalCliTarget;
   buildCliTargetInput: typeof buildCliTargetInput;
}): Promise<ResolvedCliTarget | undefined> {
   return args.resolveOptionalCliTarget(args.buildCliTargetInput(args.options));
}

async function executeStartAction(args: {
   options: StartActionOptions;
   parsePlatform: (
      target: string | undefined,
      options?: { allowVirtual?: boolean },
   ) => Platform;
   resolveOptionalCliTarget: typeof resolveOptionalCliTarget;
   buildCliTargetInput: typeof buildCliTargetInput;
   core: typeof Core;
}): Promise<{
   target: ResolvedCliTarget['reportTarget'] | { kind: 'driver-target'; value: string };
   result: { session: Awaited<ReturnType<typeof Core.startDriverSession>> };
}> {
   const resolved = await resolveStartTarget({
      options: args.options,
      resolveOptionalCliTarget: args.resolveOptionalCliTarget,
      buildCliTargetInput: args.buildCliTargetInput,
   });
   const target = args.parsePlatform(
      args.options.target,
      buildVirtualTargetGuardOptions(args.options.allowVirtual),
   );
   let openedBrowser:
      | Awaited<ReturnType<typeof args.core.openUrlInSystemAutomationBrowser>>
      | undefined = undefined;
   if (resolved && target !== 'virtual') {
      openedBrowser = await args.core.openUrlInSystemAutomationBrowser(
         resolved.resolvedUrl,
      );
      await delay(REAL_BROWSER_LAUNCH_DELAY_MS);
   }
   const session = await startDriverSessionForTarget({
      options: args.options,
      parsePlatform: args.parsePlatform,
      core: args.core,
   });
   if (resolved) {
      if (session.targetType === 'real') {
         if (openedBrowser?.focusTarget) {
            await delay(REAL_BROWSER_FOCUS_DELAY_MS);
            await args.core.runDriverSessionAction(session.sessionId, 'focus', {
               payload: openedBrowser.focusTarget,
            });
         }
      } else {
         await args.core.attachDocumentToDriverSession(session.sessionId, {
            html: resolved.html,
            url: resolved.resolvedUrl,
         });
      }
   }

   return {
      target: resolved?.reportTarget ?? {
         kind: 'driver-target',
         value: session.target,
      },
      result: { session },
   };
}

async function handleStartAction(options: StartActionOptions): Promise<void> {
   const [
      { executeCommand, parsePlatform, resolveOptionalCliTarget },
      { buildCliTargetInput },
      renderers,
      core,
   ] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('../renderers/drive.js'),
      import('#core'),
   ]);

   const { warnings } = await applyDefaultDriverTarget(options, core);

   await executeCommand(
      {
         family: 'sr',
         subcommand: 'start',
         wcagVersion: undefined,
         json: options.json,
      },
      async () => {
         const result = await executeStartAction({
            options,
            parsePlatform,
            resolveOptionalCliTarget,
            buildCliTargetInput,
            core,
         });
         await persistImplicitDriveSession(result.result.session.sessionId);
         const execution: CommandExecution = { ...result };
         if (warnings) {
            execution.warnings = warnings;
         }
         return execution;
      },
      renderers.renderDriveSessionText,
   );
}

function registerStartCommand(driveCommand: Command): void {
   addJsonOption(
      addRecordingOption(
         addAllowVirtualOption(
            driveCommand
               .command('start')
               .description('Start a persistent driver session.')
               .option(
                  '--target <platform>',
                  'Choose one target: voiceover, nvda, or virtual. Defaults to an available VoiceOver or NVDA target, then falls back to virtual as a last resort. Use --allow-virtual to explicitly request simulation.',
               )
               .option('--url <url>', 'Attach one live URL target to the new session.'),
         ),
      ),
   ).action(handleStartAction);
}

function registerStatusCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addSessionOption(
            driveCommand
               .command('status')
               .description('Show persisted session state and capability metadata.'),
         ),
      ),
   ).action(async (options: { json?: boolean; verbose?: boolean; session?: string }) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeCommand(
         {
            family: 'sr',
            subcommand: 'status',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => executeStatusAction(options),
         renderers.renderDriveStatusText,
      );
   });
}

function registerStopCommand(driveCommand: Command): void {
   addJsonOption(
      addSessionOption(
         driveCommand
            .command('stop')
            .description('Stop a persistent driver session and remove its state file.'),
      ),
   ).action(async (options: { json?: boolean; session?: string }) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeCommand(
         {
            family: 'sr',
            subcommand: 'stop',
            wcagVersion: undefined,
            json: options.json,
         },
         () => executeStopAction(options),
         renderers.renderDriveStopText,
      );
   });
}

function registerDriverCommands(
   program: Command,
   commandName: string,
   options?: { noHelp?: boolean },
): void {
   const driveCommand = program
      .command(commandName, options)
      .description('Control a target screen reader through stable sessions.');

   registerStartCommand(driveCommand);
   registerStatusCommand(driveCommand);
   registerStopCommand(driveCommand);
   registerSimpleActions(driveCommand);
   registerMiddleActions(driveCommand);
   registerTrailingActions(driveCommand);
}

export function registerSessionCommands(program: Command): void {
   registerDriverCommands(program, 'sr');
}
