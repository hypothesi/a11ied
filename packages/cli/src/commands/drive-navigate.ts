import type { Command } from 'commander';
import {
   driverNavigationKindSchema,
   type DriverNavigatePayload,
   type DriverNavigationDirection,
} from '#contracts';
import { CliUsageError, getNavigationKindEntry } from '#core';
import {
   addDriveNavigationOptions,
   DRIVE_GROUPS,
   parseCountOption,
   type DriveActionOptions,
} from './drive-options.js';

interface NavigateOptions extends DriveActionOptions {
   level?: string;
   times?: string;
}

const KIND_LIST = driverNavigationKindSchema.options.join(', ');
const MAX_HEADING_LEVEL = 6;
const KIND_COLUMN_WIDTH = Math.max(
   ...driverNavigationKindSchema.options.map((kind) => kind.length),
);

function buildKindHelp(): string {
   const lines = driverNavigationKindSchema.options.map(
      (kind) =>
         `  ${kind.padEnd(KIND_COLUMN_WIDTH)}  ${getNavigationKindEntry(kind).description}`,
   );
   return `\nKinds:\n${lines.join('\n')}\n\nOn the virtual reader, button, control, table, list, graphic, and form-field walk item by item until the announced role matches.\n`;
}

function parseKind(kind: string | undefined): DriverNavigatePayload['kind'] {
   if (kind === undefined) {
      return 'item';
   }
   const parsed = driverNavigationKindSchema.safeParse(kind);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `"${kind}" is not a kind you can jump by. Use one of: ${KIND_LIST}.`,
         {
            field: 'kind',
            value: kind,
            supportedKinds: [...driverNavigationKindSchema.options],
         },
      );
   }
   return parsed.data;
}

function parseLevel(level: string | undefined, kind: string): number | undefined {
   if (level === undefined) {
      return undefined;
   }
   if (kind !== 'heading') {
      throw new CliUsageError(
         'validation-error',
         `--level applies to headings only; "${kind}" has no levels.`,
         { field: 'level', value: level, kind },
      );
   }
   const parsed = parseCountOption(level, 'level');
   if (parsed === undefined || parsed < 1 || parsed > MAX_HEADING_LEVEL) {
      throw new CliUsageError(
         'validation-error',
         '--level must be a heading level, 1 to 6.',
         {
            field: 'level',
            value: level,
         },
      );
   }
   return parsed;
}

/** Builds the `next` or `previous` payload from the positional kind and its options. */
export function buildNavigatePayload(
   kind: string | undefined,
   options: NavigateOptions,
): DriverNavigatePayload | undefined {
   const parsedKind = parseKind(kind);
   const level = parseLevel(options.level, parsedKind),
      times = parseCountOption(options.times, 'times');
   if (times !== undefined && times < 1) {
      throw new CliUsageError('validation-error', '--times must be at least 1.', {
         field: 'times',
         value: options.times,
      });
   }
   if (parsedKind === 'item' && level === undefined && times === undefined) {
      return undefined;
   }
   const payload: DriverNavigatePayload = { kind: parsedKind };
   if (level !== undefined) {
      payload.level = level;
   }
   if (times !== undefined) {
      payload.times = times;
   }
   return payload;
}

/** Registers `next [kind]` or `previous [kind]` with the --level and --times options. */
export function registerDirectionCommand(
   driveCommand: Command,
   direction: DriverNavigationDirection,
): void {
   addDriveNavigationOptions(
      driveCommand
         .command(`${direction} [kind]`)
         .helpGroup(DRIVE_GROUPS.move)
         .summary(`Move to the ${direction} item, or jump by kind.`)
         .description(`Move to the ${direction} item, or jump by kind: ${KIND_LIST}.`)
         .option('--level <n>', 'With heading: only headings of this level, 1 to 6.')
         .option('--times <n>', 'Repeat the move this many times.')
         .addHelpText('after', buildKindHelp),
   ).action(async (kind: string | undefined, options: NavigateOptions) => {
      const [{ executeDriveActionCommand }, { renderDriveReadText }] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      const typed = [direction, kind];
      if (options.level !== undefined) {
         typed.push('--level', options.level);
      }
      if (options.times !== undefined) {
         typed.push('--times', options.times);
      }
      await executeDriveActionCommand({
         subcommand: direction,
         commandLine: typed.filter((part) => part !== undefined).join(' '),
         request: () => {
            const payload = buildNavigatePayload(kind, options);
            return payload ? { action: direction, payload } : { action: direction };
         },
         options,
         renderText: renderDriveReadText,
      });
   });
}
