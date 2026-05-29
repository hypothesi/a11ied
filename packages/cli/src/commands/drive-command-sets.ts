import type { Command } from 'commander';
import type { Platform } from '#contracts';
import type { DriverCommandSet, ListDriverCommandsOptions } from '#core';
import type * as Core from '#core';
import {
   addAllowVirtualOption,
   addEphemeralOption,
   addJsonOption,
   addSessionOption,
   addTargetOption,
   addVerboseOption,
} from '../lib/options.js';
import type { CommandExecution } from '../lib/helpers.js';

interface DriveActionOptions {
   json?: boolean;
   verbose?: boolean;
   session?: string;
   target?: string;
   ephemeral?: boolean;
   allowVirtual?: boolean;
}

interface DriveCommandsOptions {
   json?: boolean;
   verbose?: boolean;
   target?: string;
   commandSet?: string;
   query?: string;
}

const DRIVE_COMMAND_SET_HELP =
   'Command set: auto, portable, voiceover-commander, voiceover-keycode, or nvda-keycode.';

function addDrivePerformOptions(command: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addEphemeralOption(
            addAllowVirtualOption(addTargetOption(addSessionOption(command))),
         ),
      ),
   );
}

function buildCommandListOptions(args: {
   target: Platform | undefined;
   commandSet: DriverCommandSet | undefined;
   query: string | undefined;
}): ListDriverCommandsOptions {
   const options: ListDriverCommandsOptions = {};
   if (args.target) {
      options.target = args.target;
   }
   if (args.commandSet) {
      options.commandSet = args.commandSet;
   }
   if (args.query) {
      options.query = args.query;
   }
   return options;
}

function resolveCommandSet(
   rawCommandSet: string | undefined,
   core: typeof Core,
): DriverCommandSet | undefined {
   if (!rawCommandSet) {
      return undefined;
   }
   try {
      return core.parseDriverCommandSet(rawCommandSet);
   } catch (error) {
      if (error instanceof core.DriverCommandError) {
         throw new core.CliUsageError(error.code, error.message, error.details);
      }
      throw error;
   }
}

function resolveCommandsTarget(args: {
   rawTarget: string | undefined;
   parsePlatform: (
      target: string | undefined,
      options?: { allowVirtual?: boolean },
   ) => Platform;
}): Platform | undefined {
   if (!args.rawTarget) {
      return undefined;
   }
   return args.parsePlatform(args.rawTarget, { allowVirtual: true });
}

function buildCommandsExecution(args: {
   options: DriveCommandsOptions;
   parsePlatform: (
      target: string | undefined,
      options?: { allowVirtual?: boolean },
   ) => Platform;
   core: typeof Core;
}): CommandExecution {
   const target = resolveCommandsTarget({
      rawTarget: args.options.target,
      parsePlatform: args.parsePlatform,
   });
   const commandSet = resolveCommandSet(args.options.commandSet, args.core);
   const result = args.core.listDriverCommands(
      buildCommandListOptions({
         target,
         commandSet,
         query: args.options.query,
      }),
   ) as unknown as Record<string, unknown>;
   if (!target) {
      return { result };
   }
   return { target: { kind: 'driver-target', value: target }, result };
}

function registerPerformCommand(driveCommand: Command): void {
   addDrivePerformOptions(
      driveCommand
         .command('perform <command>')
         .description('Perform a named screen-reader command.')
         .option('--command-set <set>', DRIVE_COMMAND_SET_HELP, 'auto')
         .addHelpText(
            'after',
            `
Examples:
  a11ied session perform move-right --target voiceover --ephemeral
  a11ied session perform voiceover-keycode:next --target voiceover --ephemeral
  a11ied session perform report-current-focus --target nvda --ephemeral

Use "a11ied session commands" to list every supported command.
`,
         ),
   ).action(
      async (command: string, options: DriveActionOptions & { commandSet: string }) => {
         const [{ executeDriveActionCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/drive.js'),
         ]);

         await executeDriveActionCommand({
            subcommand: 'perform',
            action: 'perform',
            options,
            payload: { command, commandSet: options.commandSet },
            renderText: renderers.renderDriveStatusText,
         });
      },
   );
}

function registerCommandsCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         driveCommand
            .command('commands')
            .description('List supported named driver commands.')
            .option('--target <target>', 'Filter by target: voiceover, nvda, or virtual.')
            .option('--command-set <set>', DRIVE_COMMAND_SET_HELP)
            .option('--query <query>', 'Filter command aliases and upstream keys.'),
      ),
   ).action(async (options: DriveCommandsOptions) => {
      const [{ executeCommand, parsePlatform }, core, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('#core'),
         import('../renderers/drive.js'),
      ]);

      await executeCommand(
         {
            family: 'session',
            subcommand: 'commands',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => buildCommandsExecution({ options, parsePlatform, core }),
         renderers.renderDriveCommandsText,
      );
   });
}

export function registerCommandSetActions(driveCommand: Command): void {
   registerPerformCommand(driveCommand);
   registerCommandsCommand(driveCommand);
}
