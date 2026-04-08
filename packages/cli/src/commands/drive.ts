import type { Command } from 'commander';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   startDriverSession,
   stopDriverSession,
} from '@a11lied/core';
import {
   addJsonOption,
   addStorybookTargetOptions,
   addVerboseOption,
} from '../lib/options.js';
import { buildCliTargetInput } from '../lib/target-input.js';
import {
   executeCommand,
   parsePlatform,
   resolveOptionalCliTarget,
} from '../lib/execute.js';
import { renderDriveSessionText, renderDriveStatusText } from '../renderers/drive.js';
import {
   registerMiddleActions,
   registerSimpleActions,
   registerTrailingActions,
} from './drive-actions.js';

async function handleStartAction(options: {
   json?: boolean;
   target: string;
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}): Promise<void> {
   await executeCommand(
      {
         family: 'drive',
         subcommand: 'start',
         wcagVersion: undefined,
         json: options.json,
      },
      async () => {
         const session = await startDriverSession(parsePlatform(options.target));
         const resolved = await resolveOptionalCliTarget(buildCliTargetInput(options));
         if (resolved) {
            await attachDocumentToDriverSession(session.sessionId, {
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
      },
      renderDriveSessionText,
   );
}

function registerStartCommand(driveCommand: Command): void {
   addJsonOption(
      addStorybookTargetOptions(
         driveCommand
            .command('start')
            .description('Start a persistent driver session.')
            .requiredOption(
               '--target <platform>',
               'Choose one target: virtual, voiceover, or nvda.',
            )
            .option('--url <url>', 'Attach one live URL target to the new session.'),
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
      await executeCommand(
         {
            family: 'drive',
            subcommand: 'status',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         async () => {
            const result = await getDriverSessionStatus(options.session);
            return {
               target: { kind: 'driver-session', value: options.session },
               result,
            };
         },
         renderDriveStatusText,
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
      await executeCommand(
         {
            family: 'drive',
            subcommand: 'stop',
            wcagVersion: undefined,
            json: options.json,
         },
         async () => {
            const result = await stopDriverSession(options.session);
            return {
               target: { kind: 'driver-session', value: options.session },
               result,
            };
         },
         renderDriveStatusText,
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
