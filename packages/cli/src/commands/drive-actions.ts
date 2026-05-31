import type { Command } from 'commander';
import {
   addAllowVirtualOption,
   addEphemeralOption,
   addJsonOption,
   addSessionOption,
   addTargetOption,
   addVerboseOption,
} from '../lib/options.js';
import { getDriveKeyHelp } from './drive-key-help.js';

interface DriveActionOptions {
   json?: boolean;
   verbose?: boolean;
   session?: string;
   target?: string;
   ephemeral?: boolean;
   allowVirtual?: boolean;
}

interface FocusActionOptions extends DriveActionOptions {
   app?: string;
   bundleId?: string;
   process?: string;
   pid?: string;
   windowTitle?: string;
   match?: string;
}

interface SimpleActionConfig {
   name: string;
   description: string;
   renderer: 'status' | 'logs';
}

function addDriveActionOptions(command: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addEphemeralOption(
            addAllowVirtualOption(addTargetOption(addSessionOption(command))),
         ),
      ),
   );
}

function registerSimpleAction(driveCommand: Command, config: SimpleActionConfig): void {
   addDriveActionOptions(
      driveCommand.command(config.name).description(config.description),
   ).action(async (options: DriveActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      let renderText = renderers.renderDriveStatusText;
      if (config.renderer === 'logs') {
         renderText = renderers.renderDriveLogsText;
      }

      await executeDriveActionCommand({
         subcommand: config.name,
         action: config.name as 'next',
         options,
         payload: undefined,
         renderText,
      });
   });
}

export function registerPressCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('press <keys>')
         .description('Send one or more key chords to the screen reader.')
         .addHelpText('after', () => getDriveKeyHelp()),
   ).action(async (keys: string, options: DriveActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'press',
         action: 'key',
         autoStart: true,
         options,
         payload: { keys },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

export function registerTypeCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('type <text>')
         .description('Type text through the active driver target.'),
   ).action(async (text: string, options: DriveActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'type',
         action: 'type',
         autoStart: true,
         options,
         payload: { text },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

function parsePidValue(pid: string | undefined): number | undefined {
   if (!pid) {
      return undefined;
   }
   const parsed = Number(pid);
   if (Number.isNaN(parsed)) {
      return undefined;
   }
   return parsed;
}

function buildFocusEntries(options: FocusActionOptions): Array<[string, unknown]> {
   return [
      ['appName', options.app],
      ['bundleId', options.bundleId],
      ['processName', options.process],
      ['windowTitle', options.windowTitle],
      ['match', options.match],
      ['pid', parsePidValue(options.pid)],
   ];
}

function buildFocusPayload(options: FocusActionOptions): Record<string, unknown> {
   const payload: Record<string, unknown> = {};
   for (const [key, value] of buildFocusEntries(options)) {
      if (value !== undefined && value !== '') {
         payload[key] = value;
      }
   }
   if (!payload.match && payload.windowTitle) {
      payload.match = 'contains';
   }
   return payload;
}

export function registerFocusCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('focus')
         .description('Focus a window so the screen reader follows the right app.')
         .option('--app <name>', 'macOS app name to bring to the front.')
         .option('--bundle-id <id>', 'macOS bundle identifier to focus.')
         .option('--process <name>', 'Windows process name to focus.')
         .option('--pid <pid>', 'Windows process id to focus.')
         .option('--window-title <title>', 'Window title to focus.')
         .option('--match <mode>', 'Window title match: contains or exact.'),
   ).action(async (options: FocusActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'focus',
         action: 'focus',
         options,
         payload: buildFocusPayload(options),
         renderText: renderers.renderDriveStatusText,
      });
   });
}

export function registerClearLogsCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addSessionOption(
            driveCommand
               .command('clear-logs')
               .description('Clear captured speech and action logs.'),
         ),
      ),
   ).action(async (options: { json?: boolean; verbose?: boolean; session?: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'clear-logs',
         action: 'clear-logs',
         options,
         payload: undefined,
         renderText: renderers.renderDriveLogsText,
      });
   });
}

export function registerCheckpointCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('checkpoint <label>')
         .description('Record a named checkpoint in the current session.'),
   ).action(async (label: string, options: DriveActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'checkpoint',
         action: 'checkpoint',
         options,
         payload: { label },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

export function registerNextCommand(driveCommand: Command): void {
   registerSimpleAction(driveCommand, {
      name: 'next',
      description: 'Move to the next screen reader element. Requires an active session.',
      renderer: 'status',
   });
}

export function registerReadCommand(driveCommand: Command): void {
   registerSimpleAction(driveCommand, {
      name: 'read',
      description: 'Read the current driver state.',
      renderer: 'status',
   });
}

export function registerLogsCommand(driveCommand: Command): void {
   registerSimpleAction(driveCommand, {
      name: 'logs',
      description: 'Read captured speech and action logs.',
      renderer: 'logs',
   });
}
