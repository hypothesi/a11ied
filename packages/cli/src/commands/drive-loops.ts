import type { Command } from 'commander';
import type * as ExecuteModule from '../lib/execute.js';
import type * as LoopRenderers from '../renderers/drive-loops.js';
import type * as ReadRenderers from '../renderers/drive.js';
import {
   DEFAULT_ELEMENTS_MAX,
   DEFAULT_GOTO_MAX,
   DEFAULT_READ_ALL_MAX,
   driverElementsPayloadSchema,
   type CliMessage,
   type DriverActionResult,
   type DriverElementsPayload,
} from '#contracts';
import { CliUsageError } from '#core';
import {
   addDriveActionOptions,
   addDriveNavigationOptions,
   DRIVE_GROUPS,
   parseCountOption,
   type DriveActionOptions,
} from './drive-options.js';

interface LoopOptions extends DriveActionOptions {
   max?: string;
}

interface GotoOptions extends LoopOptions {
   role?: string;
   name?: string;
}

const ELEMENT_KINDS = driverElementsPayloadSchema.shape.kind.options.join(', ');

interface LoopRunner {
   executeDriveActionCommand: typeof ExecuteModule.executeDriveActionCommand;
   renderers: typeof LoopRenderers;
   renderDriveReadText: typeof ReadRenderers.renderDriveReadText;
}

async function loadRunner(): Promise<LoopRunner> {
   const [{ executeDriveActionCommand }, renderers, { renderDriveReadText }] =
      await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive-loops.js'),
         import('../renderers/drive.js'),
      ]);
   return { executeDriveActionCommand, renderers, renderDriveReadText };
}

/** Parses --max, rejecting 0 because a loop that may not step is not a loop. */
export function parseMaxOption(value: string | undefined, fallback: number): number {
   const parsed = parseCountOption(value, 'max');
   if (parsed === undefined) {
      return fallback;
   }
   if (parsed < 1) {
      throw new CliUsageError('validation-error', '--max must be at least 1.', {
         field: 'max',
         value,
      });
   }
   return parsed;
}

function parseElementKind(kind: string): DriverElementsPayload['kind'] {
   const parsed = driverElementsPayloadSchema.shape.kind.safeParse(kind);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `"${kind}" is not a kind you can list. Use one of: ${ELEMENT_KINDS}.`,
         { field: 'kind', value: kind },
      );
   }
   return parsed.data;
}

export function registerElementsCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('elements <kind>')
         .helpGroup(DRIVE_GROUPS.move)
         .summary('List every element of one kind as the reader announces it.')
         .description(
            `The rotor: move to the top, then list every element of one kind as the reader announces it. Kinds: ${ELEMENT_KINDS}. Needs an active session; run "a1 sr start --sr virtual --allow-virtual" first for the simulated reader instead of the VoiceOver default.`,
         )
         .option(
            '--max <n>',
            `Stop after this many elements. Defaults to ${String(DEFAULT_ELEMENTS_MAX)}.`,
         ),
   ).action(async (kind: string, options: LoopOptions) => {
      const { executeDriveActionCommand, renderers } = await loadRunner();
      await executeDriveActionCommand({
         subcommand: 'elements',
         commandLine: `elements ${kind}`,
         request: () => ({
            action: 'elements',
            payload: {
               kind: parseElementKind(kind),
               max: parseMaxOption(options.max, DEFAULT_ELEMENTS_MAX),
            },
         }),
         options,
         renderText: renderers.renderDriveElementsText,
      });
   });
}

export function registerReadAllCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('read-all')
         .helpGroup(DRIVE_GROUPS.move)
         .summary('Read from the cursor to the end and print the transcript.')
         .description(
            'Say-all as a transcript: step item by item from the cursor to the end of the document, bounded by --max. Needs an active session; run "a1 sr start --sr virtual --allow-virtual" first for the simulated reader instead of the VoiceOver default.',
         )
         .option(
            '--max <n>',
            `Stop after this many items. Defaults to ${String(DEFAULT_READ_ALL_MAX)}.`,
         ),
   ).action(async (options: LoopOptions) => {
      const { executeDriveActionCommand, renderers } = await loadRunner();
      await executeDriveActionCommand({
         subcommand: 'read-all',
         request: () => ({
            action: 'read-all',
            payload: { max: parseMaxOption(options.max, DEFAULT_READ_ALL_MAX) },
         }),
         options,
         renderText: renderers.renderDriveReadAllText,
      });
   });
}

/** Fails `sr goto` with exit code 4 when no item matched before the end or the cap. */
export function gotoVerdict(result: DriverActionResult): CliMessage | undefined {
   if (result.details?.found !== false) {
      return undefined;
   }
   const wanted = [
      result.details.role === undefined ? '' : `role ${String(result.details.role)}`,
      result.details.name === undefined ? '' : `name "${String(result.details.name)}"`,
   ]
      .filter(Boolean)
      .join(' and ');
   return {
      code: 'item-not-found',
      message: `No item with ${wanted} after the cursor (stopped at the ${String(result.details.stoppedAt)} after ${String(result.details.steps)} steps).`,
      details: result.details,
   };
}

interface GotoPayload {
   role?: string;
   name?: string;
   max: number;
}

function buildGotoRequest(options: GotoOptions): {
   action: 'goto';
   payload: GotoPayload;
} {
   if (!options.role && !options.name) {
      throw new CliUsageError(
         'validation-error',
         'Pass --role, --name, or both so goto knows what to look for.',
         { field: 'goto' },
      );
   }
   const payload: GotoPayload = { max: parseMaxOption(options.max, DEFAULT_GOTO_MAX) };
   if (options.role) {
      payload.role = options.role;
   }
   if (options.name) {
      payload.name = options.name;
   }
   return { action: 'goto', payload };
}

export function registerGotoCommand(driveCommand: Command): void {
   addDriveNavigationOptions(
      driveCommand
         .command('goto')
         .helpGroup(DRIVE_GROUPS.move)
         .summary('Step forward to an item with a given role or name.')
         .description(
            'Step forward until the current item has the given role, name, or both. Exits 4 when nothing matches. Needs an active session; run "a1 sr start --sr virtual --allow-virtual" first for the simulated reader instead of the VoiceOver default.',
         )
         .option('--role <role>', 'Role to match, such as link, button, or heading.')
         .option('--name <text>', 'Text the name must contain, ignoring case.')
         .option(
            '--max <n>',
            `Stop after this many steps. Defaults to ${String(DEFAULT_GOTO_MAX)}.`,
         ),
   ).action(async (options: GotoOptions) => {
      const { executeDriveActionCommand, renderDriveReadText } = await loadRunner();
      const typed = ['goto'];
      if (options.role) {
         typed.push('--role', options.role);
      }
      if (options.name) {
         typed.push('--name', options.name);
      }
      await executeDriveActionCommand({
         subcommand: 'goto',
         commandLine: typed.join(' '),
         request: () => buildGotoRequest(options),
         options,
         renderText: renderDriveReadText,
         verdict: gotoVerdict,
      });
   });
}
