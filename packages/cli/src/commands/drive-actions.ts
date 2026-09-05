import type { Command } from 'commander';
import type * as ExecuteModule from '../lib/execute.js';
import type * as RenderModule from '../renderers/drive.js';
import { portableDriverVerbSchema, type DriverFocusTarget } from '#contracts';
import { getPortableCommand } from '#core';
import { addPhraseOption } from '../lib/options.js';
import { getDriveKeyHelp } from './drive-key-help.js';
import { registerDirectionCommand } from './drive-navigate.js';
import {
   addDriveActionOptions,
   addDriveAutoStartOptions,
   addDriveNavigationOptions,
   type DriveActionOptions,
   type DriveAutoStartOptions,
} from './drive-options.js';

interface FocusActionOptions extends DriveActionOptions {
   app?: string;
   bundleId?: string;
   process?: string;
   pid?: string;
   windowTitle?: string;
   match?: string;
}

interface DriveRunner {
   executeDriveActionCommand: typeof ExecuteModule.executeDriveActionCommand;
   renderDriveReadText: typeof RenderModule.renderDriveReadText;
}

async function loadDriveRunner(): Promise<DriveRunner> {
   const [{ executeDriveActionCommand }, { renderDriveReadText }] = await Promise.all([
      import('../lib/execute.js'),
      import('../renderers/drive.js'),
   ]);
   return { executeDriveActionCommand, renderDriveReadText };
}

/**
 * Registers next and previous with their kinds, then top, bottom, interact,
 * stop-interacting, activate, and escape.
 */
export function registerNavigationCommands(driveCommand: Command): void {
   registerDirectionCommand(driveCommand, 'next');
   registerDirectionCommand(driveCommand, 'previous');
   for (const verb of portableDriverVerbSchema.exclude(['next', 'previous']).options) {
      addDriveNavigationOptions(
         driveCommand.command(verb).description(getPortableCommand(verb).description),
      ).action(async (options: DriveActionOptions) => {
         const { executeDriveActionCommand, renderDriveReadText } =
            await loadDriveRunner();
         await executeDriveActionCommand({
            subcommand: verb,
            request: { action: verb },
            options,
            renderText: renderDriveReadText,
         });
      });
   }
}

export function registerReadCommand(driveCommand: Command): void {
   addDriveNavigationOptions(
      driveCommand
         .command('read')
         .description(
            'Read the current item: the last phrase and item text, without moving.',
         ),
   ).action(async (options: DriveActionOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadDriveRunner();
      await executeDriveActionCommand({
         subcommand: 'read',
         request: { action: 'read' },
         options,
         renderText: renderDriveReadText,
      });
   });
}

export function registerPressCommand(driveCommand: Command): void {
   addPhraseOption(
      addDriveAutoStartOptions(
         driveCommand
            .command('press <chord...>')
            .description('Press key chords in order, one chord per argument.')
            .addHelpText('after', () => getDriveKeyHelp()),
      ),
   ).action(async (chords: string[], options: DriveAutoStartOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadDriveRunner();
      await executeDriveActionCommand({
         subcommand: 'press',
         commandLine: `press ${chords.join(' ')}`,
         request: { action: 'press', payload: { keys: chords } },
         autoStart: true,
         options,
         renderText: renderDriveReadText,
      });
   });
}

export function registerTypeCommand(driveCommand: Command): void {
   addDriveAutoStartOptions(
      driveCommand
         .command('type <text>')
         .description('Type text through the active target.'),
   ).action(async (text: string, options: DriveAutoStartOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadDriveRunner();
      await executeDriveActionCommand({
         subcommand: 'type',
         request: { action: 'type', payload: { text } },
         autoStart: true,
         options,
         renderText: renderDriveReadText,
      });
   });
}

function parsePidValue(pid: string | undefined): number | undefined {
   if (!pid) {
      return undefined;
   }
   const parsed = Number(pid);
   return Number.isNaN(parsed) ? undefined : parsed;
}

function buildFocusPayload(options: FocusActionOptions): DriverFocusTarget | undefined {
   const payload: DriverFocusTarget = {};
   if (options.app) {
      payload.appName = options.app;
   }
   if (options.bundleId) {
      payload.bundleId = options.bundleId;
   }
   if (options.process) {
      payload.processName = options.process;
   }
   if (options.windowTitle) {
      payload.windowTitle = options.windowTitle;
      payload.match = options.match === 'exact' ? 'exact' : 'contains';
   }
   const pid = parsePidValue(options.pid);
   if (pid !== undefined) {
      payload.pid = pid;
   }
   return Object.keys(payload).length > 0 ? payload : undefined;
}

export function registerFocusCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('focus')
         .description(
            'Bring a window to the front. With no options, refocus the app the session opened.',
         )
         .option('--app <name>', 'macOS app name to bring to the front.')
         .option('--bundle-id <id>', 'macOS bundle identifier to focus.')
         .option('--process <name>', 'Windows process name to focus.')
         .option('--pid <pid>', 'Windows process id to focus.')
         .option('--window-title <title>', 'Window title to focus.')
         .option('--match <mode>', 'Window title match: contains or exact.'),
   ).action(async (options: FocusActionOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadDriveRunner();
      await executeDriveActionCommand({
         subcommand: 'focus',
         request: { action: 'focus', payload: buildFocusPayload(options) },
         options,
         renderText: renderDriveReadText,
      });
   });
}

export function registerCheckpointCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('checkpoint <label>')
         .description('Mark a named point in the transcript for --since.'),
   ).action(async (label: string, options: DriveActionOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadDriveRunner();
      await executeDriveActionCommand({
         subcommand: 'checkpoint',
         commandLine: `checkpoint ${label}`,
         request: { action: 'checkpoint', payload: { label } },
         options,
         renderText: renderDriveReadText,
      });
   });
}
