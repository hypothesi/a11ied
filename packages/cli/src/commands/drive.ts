import type { Command } from 'commander';
import type * as Core from '#core';
import type { Platform } from '#contracts';
import type { resolveOptionalCliTarget } from '../lib/execute.js';
import {
   addJsonOption,
   addRecordingOption,
   addStorybookTargetOptions,
   addVerboseOption,
} from '../lib/options.js';
import type { buildCliTargetInput, CliTargetInputOptions } from '../lib/target-input.js';
import type { ResolvedCliTarget } from '../lib/resolvers.js';
import {
   registerMiddleActions,
   registerSimpleActions,
   registerTrailingActions,
} from './drive-actions.js';

interface StartActionOptions extends CliTargetInputOptions {
   json?: boolean;
   target: string;
   recording?: string;
}

async function startDriverSessionForTarget(args: {
   options: StartActionOptions;
   parsePlatform: (target: string | undefined) => Platform;
   core: typeof Core;
}): Promise<Awaited<ReturnType<typeof Core.startDriverSession>>> {
   return args.core.startDriverSession(
      args.parsePlatform(args.options.target),
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
   parsePlatform: (target: string | undefined) => Platform;
   resolveOptionalCliTarget: typeof resolveOptionalCliTarget;
   buildCliTargetInput: typeof buildCliTargetInput;
   core: typeof Core;
}): Promise<{
   target: ResolvedCliTarget['reportTarget'] | { kind: 'driver-target'; value: string };
   result: { session: Awaited<ReturnType<typeof Core.startDriverSession>> };
}> {
   const session = await startDriverSessionForTarget({
      options: args.options,
      parsePlatform: args.parsePlatform,
      core: args.core,
   });
   const resolved = await resolveStartTarget({
      options: args.options,
      resolveOptionalCliTarget: args.resolveOptionalCliTarget,
      buildCliTargetInput: args.buildCliTargetInput,
   });
   if (resolved) {
      await args.core.attachDocumentToDriverSession(session.sessionId, {
         html: resolved.html,
         url: resolved.resolvedUrl,
      });
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

   await executeCommand(
      {
         family: 'drive',
         subcommand: 'start',
         wcagVersion: undefined,
         json: options.json,
      },
      () =>
         executeStartAction({
            options,
            parsePlatform,
            resolveOptionalCliTarget,
            buildCliTargetInput,
            core,
         }),
      renderers.renderDriveSessionText,
   );
}

function registerStartCommand(driveCommand: Command): void {
   addJsonOption(
      addStorybookTargetOptions(
         addRecordingOption(
            driveCommand
               .command('start')
               .description('Start a persistent driver session.')
               .requiredOption(
                  '--target <platform>',
                  'Choose one target: virtual, voiceover, or nvda.',
               )
               .option('--url <url>', 'Attach one live URL target to the new session.'),
         ),
      ),
   ).action(handleStartAction);
}

function registerStatusCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         driveCommand
            .command('status')
            .description('Show persisted session state and capability metadata.')
            .requiredOption('--session <id>', 'Reuse an existing driver session.'),
      ),
   ).action(async (options: { json?: boolean; verbose?: boolean; session: string }) => {
      const [{ executeCommand }, renderers, core] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
         import('#core'),
      ]);

      await executeCommand(
         {
            family: 'drive',
            subcommand: 'status',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         async () => {
            const result = await core.getDriverSessionStatus(options.session);
            return {
               target: { kind: 'driver-session', value: options.session },
               result,
            };
         },
         renderers.renderDriveStatusText,
      );
   });
}

function registerStopCommand(driveCommand: Command): void {
   addJsonOption(
      driveCommand
         .command('stop')
         .description('Stop a persistent driver session and remove its state file.')
         .requiredOption('--session <id>', 'Reuse an existing driver session.'),
   ).action(async (options: { json?: boolean; session: string }) => {
      const [{ executeCommand }, renderers, core] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
         import('#core'),
      ]);

      await executeCommand(
         {
            family: 'drive',
            subcommand: 'stop',
            wcagVersion: undefined,
            json: options.json,
         },
         async () => {
            const result = await core.stopDriverSession(options.session);
            return {
               target: { kind: 'driver-session', value: options.session },
               result,
            };
         },
         renderers.renderDriveStatusText,
      );
   });
}

export function registerDriveCommands(program: Command): void {
   const driveCommand = program
      .command('drive')
      .description('Control a target screen reader through stable sessions.');

   registerStartCommand(driveCommand);
   registerStatusCommand(driveCommand);
   registerStopCommand(driveCommand);
   registerSimpleActions(driveCommand);
   registerMiddleActions(driveCommand);
   registerTrailingActions(driveCommand);
}
