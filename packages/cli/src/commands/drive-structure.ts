import type { Command } from 'commander';
import type * as ExecuteModule from '../lib/execute.js';
import type * as RenderModule from '../renderers/drive.js';
import {
   driverTableMoveSchema,
   type CliMessage,
   type DriverActionResult,
   type DriverTableMove,
} from '#contracts';
import { CliUsageError } from '#core';
import { addDriveNavigationOptions, type DriveActionOptions } from './drive-options.js';

const TABLE_MOVE_LIST = driverTableMoveSchema.options.join(', ');

interface StructureRunner {
   executeDriveActionCommand: typeof ExecuteModule.executeDriveActionCommand;
   renderDriveReadText: typeof RenderModule.renderDriveReadText;
}

async function loadRunner(): Promise<StructureRunner> {
   const [{ executeDriveActionCommand }, { renderDriveReadText }] = await Promise.all([
      import('../lib/execute.js'),
      import('../renderers/drive.js'),
   ]);
   return { executeDriveActionCommand, renderDriveReadText };
}

/** Fails `sr find` with exit code 4 when the reader did not land on the text. */
export function findVerdict(result: DriverActionResult): CliMessage | undefined {
   if (result.details?.found !== false) {
      return undefined;
   }
   const text = String(result.details.text ?? '');
   return {
      code: 'text-not-found',
      message: `"${text}" was not found on the page from the cursor onward.`,
      details: { text, target: result.session.target },
   };
}

export function registerTitleCommand(driveCommand: Command): void {
   addDriveNavigationOptions(
      driveCommand
         .command('title')
         .description(
            'Read the page title: document.title on virtual, the window summary on VoiceOver, the window title on NVDA.',
         ),
   ).action(async (options: DriveActionOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadRunner();
      await executeDriveActionCommand({
         subcommand: 'title',
         request: { action: 'title' },
         options,
         renderText: renderDriveReadText,
      });
   });
}

export function registerFindCommand(driveCommand: Command): void {
   addDriveNavigationOptions(
      driveCommand
         .command('find <text>')
         .description(
            `Move the cursor to the next place the text appears. Exits 4 when it is not found.`,
         ),
   ).action(async (text: string, options: DriveActionOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadRunner();
      await executeDriveActionCommand({
         subcommand: 'find',
         commandLine: `find ${text}`,
         request: { action: 'find', payload: { text } },
         options,
         renderText: renderDriveReadText,
         verdict: findVerdict,
      });
   });
}

function parseTableMove(move: string): DriverTableMove {
   const parsed = driverTableMoveSchema.safeParse(move);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `"${move}" is not a table move. Use one of: ${TABLE_MOVE_LIST}.`,
         {
            field: 'move',
            value: move,
            supportedMoves: [...driverTableMoveSchema.options],
         },
      );
   }
   return parsed.data;
}

export function registerTableCommand(driveCommand: Command): void {
   addDriveNavigationOptions(
      driveCommand
         .command('table <move>')
         .description(
            `Move inside the table the cursor is in, or read a header: ${TABLE_MOVE_LIST}.`,
         )
         .addHelpText(
            'after',
            '\nVoiceOver moves with VO-arrows inside an interacted table and reads the column header with VO-C. NVDA moves with Control-Alt-arrows and speaks headers as the cursor enters a cell. The virtual reader walks the DOM table.\n',
         ),
   ).action(async (move: string, options: DriveActionOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadRunner();
      await executeDriveActionCommand({
         subcommand: 'table',
         commandLine: `table ${move}`,
         request: () => ({ action: 'table', payload: { move: parseTableMove(move) } }),
         options,
         renderText: renderDriveReadText,
      });
   });
}
