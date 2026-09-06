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
import {
   addDriveAutoStartOptions,
   DRIVE_GROUPS,
   type DriveAutoStartOptions,
} from './drive-options.js';

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
   if (args.options.query) {
      result.query = args.options.query;
   }
   if (!isCommandList(result) || !target) {
      return { result };
   }
   return { target: { kind: 'driver-target', value: target }, result };
}

const LIST_HELP = `
Every command runs through sr do <name>. When two command sets share a name, prefix it
with the set: sr do voiceover-keycode:move-to-next or sr do voiceover-commander:move-right.
The portable set works on every target, including the virtual reader.

Examples:
  a1 sr list --query heading
  a1 sr list --query "VO-Command" --sr voiceover
  a1 sr list --command-set portable
`;

function buildDoExamples(): string {
   const examples = [
      '  a1 sr do next',
      '  a1 sr do move-right --sr voiceover --ephemeral',
      '  a1 sr do move-to-area-bottom --sr voiceover --ephemeral',
   ];

   if (process.platform !== 'darwin') {
      examples.push('  a1 sr do report-current-focus --sr nvda --ephemeral');
   }

   return `\nExamples:\n${examples.join('\n')}\n\nUse "a1 sr list" to see every available command.\n`;
}

export function registerDoCommand(driveCommand: Command): void {
   addDriveAutoStartOptions(
      driveCommand
         .command('do <command>')
         .helpGroup(DRIVE_GROUPS.act)
         .summary('Run a named screen reader command.')
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
            .helpGroup(DRIVE_GROUPS.other)
            .summary('List the named commands sr do accepts.')
            .description(
               'List the named commands sr do accepts, grouped by command set and by what they do. Start with --query; the full list is over 400 lines.',
            )
            .option(
               '--query <text>',
               'Keep only commands whose name, key sequence, or Commander phrase contains the text.',
            )
            .option('--sr <reader>', `Filter by screen reader: ${getPlatformTargets()}.`)
            .option('--command-set <set>', DRIVE_COMMAND_SET_HELP)
            .addHelpText('after', LIST_HELP),
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
