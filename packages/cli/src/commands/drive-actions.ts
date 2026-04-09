import type { Command } from 'commander';
import {
   addEphemeralOption,
   addJsonOption,
   addSessionOption,
   addTargetOption,
   addVerboseOption,
} from '../lib/options.js';

interface DriveActionOptions {
   json?: boolean;
   verbose?: boolean;
   session?: string;
   target?: string;
   ephemeral?: boolean;
}

interface SimpleActionConfig {
   name: string;
   description: string;
   renderer: 'status' | 'logs';
}

function addDriveActionOptions(command: Command): Command {
   return addVerboseOption(
      addJsonOption(addEphemeralOption(addTargetOption(addSessionOption(command)))),
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

function registerKeyCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('key')
         .description('Send one or more target-specific key chords.')
         .requiredOption('--keys <keys>', 'Send keys such as VO+RightArrow or Tab.'),
   ).action(async (options: DriveActionOptions & { keys: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'key',
         action: 'key',
         options,
         payload: { keys: options.keys },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

function registerTypeCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('type')
         .description('Type text through the active driver target.')
         .requiredOption('--text <text>', 'Text to type into the target.'),
   ).action(async (options: DriveActionOptions & { text: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'type',
         action: 'type',
         options,
         payload: { text: options.text },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

function registerClearLogsCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         driveCommand
            .command('clear-logs')
            .description('Clear captured speech and action logs.')
            .requiredOption('--session <id>', 'Reuse an existing driver session.'),
      ),
   ).action(async (options: { json?: boolean; verbose?: boolean; session: string }) => {
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

function registerCheckpointCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('checkpoint')
         .description('Record a named checkpoint in the current session.')
         .requiredOption('--label <label>', 'Attach a label to this checkpoint.'),
   ).action(async (options: DriveActionOptions & { label: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'checkpoint',
         action: 'checkpoint',
         options,
         payload: { label: options.label },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

export function registerSimpleActions(driveCommand: Command): void {
   registerSimpleAction(driveCommand, {
      name: 'next',
      description: 'Move to the next item.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'previous',
      description: 'Move to the previous item.',
      renderer: 'status',
   });
}

export function registerMiddleActions(driveCommand: Command): void {
   registerKeyCommand(driveCommand);
   registerTypeCommand(driveCommand);
   registerSimpleAction(driveCommand, {
      name: 'interact',
      description: 'Enter interaction mode.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'stop-interacting',
      description: 'Leave interaction mode.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'click-current-item',
      description: 'Activate the current item.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'read',
      description: 'Read the current driver state.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'logs',
      description: 'Read captured speech and action logs.',
      renderer: 'logs',
   });
}

export function registerTrailingActions(driveCommand: Command): void {
   registerClearLogsCommand(driveCommand);
   registerCheckpointCommand(driveCommand);
}
