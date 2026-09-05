import type { Command } from 'commander';
import type { Platform } from '#contracts';
import type {
   DriverCommandList,
   DriverCommandSet,
   ListDriverCommandsOptions,
} from '#core';
import type * as Core from '#core';
import { addJsonOption, addVerboseOption } from '../lib/options.js';
import type { CommandExecution } from '../lib/helpers.js';
import { getPlatformCommandSets, getPlatformTargets } from './drive-key-help.js';
import { addDriveAutoStartOptions, type DriveAutoStartOptions } from './drive-options.js';

interface DriveCommandsOptions {
   json?: boolean;
   verbose?: boolean;
   sr?: string;
   commandSet?: string;
   query?: string;
}

const DRIVE_COMMAND_SET_HELP = `Command set: ${getPlatformCommandSets()}.`;

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

function isCommandList(value: unknown): value is DriverCommandList {
   return typeof value === 'object' && value !== null && 'commandSets' in value;
}

function buildCommandsExecution(args: {
   options: DriveCommandsOptions;
   parsePlatform: (
      target: string | undefined,
      options?: { allowVirtual?: boolean },
   ) => Platform;
   core: typeof Core;
}): CommandExecution {
   const target = args.options.sr
      ? args.parsePlatform(args.options.sr, { allowVirtual: true })
      : undefined;
   const commandSet = resolveCommandSet(args.options.commandSet, args.core);
   const list = args.core.listDriverCommands(
      buildCommandListOptions({ target, commandSet, query: args.options.query }),
   );
   const result: Record<string, unknown> = { commandSets: list.commandSets };
   if (!isCommandList(result) || !target) {
      return { result };
   }
   return { target: { kind: 'driver-target', value: target }, result };
}

function buildDoExamples(): string {
   const examples = [
      '  a11ied sr do next',
      '  a11ied sr do move-right --sr voiceover --ephemeral',
      '  a11ied sr do move-to-area-bottom --sr voiceover --ephemeral',
   ];

   if (process.platform !== 'darwin') {
      examples.push('  a11ied sr do report-current-focus --sr nvda --ephemeral');
   }

   return `\nExamples:\n${examples.join('\n')}\n\nUse "a11ied sr list" to see every available command.\n`;
}

export function registerDoCommand(driveCommand: Command): void {
   addDriveAutoStartOptions(
      driveCommand
         .command('do <command>')
         .description(
            'Run a named screen-reader command. Use sr list for all available commands.',
         )
         .option('--command-set <set>', DRIVE_COMMAND_SET_HELP, 'auto')
         .addHelpText('after', buildDoExamples()),
   ).action(
      async (
         command: string,
         options: DriveAutoStartOptions & { commandSet: string },
      ) => {
         const [{ executeDriveActionCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/drive.js'),
         ]);

         await executeDriveActionCommand({
            subcommand: 'do',
            commandLine: `do ${command}`,
            request: {
               action: 'perform',
               payload: { command, commandSet: options.commandSet },
            },
            autoStart: true,
            options,
            renderText: renderers.renderDriveReadText,
         });
      },
   );
}

export function registerListCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         driveCommand
            .command('list')
            .description('List the named commands a screen reader accepts.')
            .option('--sr <reader>', `Filter by screen reader: ${getPlatformTargets()}.`)
            .option('--command-set <set>', DRIVE_COMMAND_SET_HELP)
            .option('--query <query>', 'Filter by command name or key sequence.'),
      ),
   ).action(async (options: DriveCommandsOptions) => {
      const [{ executeCommand, parsePlatform }, core, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('#core'),
         import('../renderers/drive-commands.js'),
      ]);

      await executeCommand(
         {
            family: 'sr',
            subcommand: 'list',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => buildCommandsExecution({ options, parsePlatform, core }),
         renderers.renderDriveCommandsText,
      );
   });
}
