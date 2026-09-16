import type { Command } from 'commander';
import type * as Core from '#core';
import type { DriverTranscriptEntry } from '#contracts';
import { addPhraseOption } from '../lib/options.js';
import {
   addDriveActionOptions,
   DRIVE_GROUPS,
   parseCountOption,
   type DriveActionOptions,
} from './drive-options.js';

const DEFAULT_LINES_COUNT = 10,
   DEFAULT_POLL_INTERVAL_MS = 250,
   ISO_TIME_END = 23,
   ISO_TIME_START = 11,
   MIN_POLL_INTERVAL_MS = 50;

export interface TailActionOptions extends DriveActionOptions {
   since?: string;
   lines?: string;
   interval?: string;
   phrase?: boolean;
   stopAfterCount?: number;
}

interface TailEmissionState {
   emitted: number;
   lastIndex: number;
}

function formatClock(iso: string): string {
   return iso.slice(ISO_TIME_START, ISO_TIME_END);
}

function formatEntryText(entry: DriverTranscriptEntry, phraseOnly?: boolean): string {
   if (phraseOnly) {
      return entry.phrase;
   }
   const clock = formatClock(entry.at);
   if (entry.checkpoint !== undefined) {
      return `--- Checkpoint: ${entry.checkpoint} [${clock}] ---`;
   }
   const item =
      entry.itemText && entry.itemText !== entry.phrase ? ` (${entry.itemText})` : '';
   return `[${clock}] ${entry.phrase}${item}`;
}

function printStreamEntry(
   entry: DriverTranscriptEntry,
   options: TailActionOptions,
): void {
   if (options.json) {
      process.stdout.write(`${JSON.stringify(entry)}\n`);
      return;
   }
   process.stdout.write(`${formatEntryText(entry, options.phrase)}\n`);
}

function resolveInitialEntries(
   allEntries: DriverTranscriptEntry[],
   options: TailActionOptions,
   linesCount: number,
): DriverTranscriptEntry[] {
   if (linesCount === 0) {
      return [];
   }
   if (allEntries.length > linesCount) {
      return allEntries.slice(-linesCount);
   }
   return allEntries;
}

function resolveLinesCount(lines?: string): number {
   if (lines === undefined) {
      return DEFAULT_LINES_COUNT;
   }
   return parseCountOption(lines, 'lines') ?? DEFAULT_LINES_COUNT;
}

function resolveIntervalMs(interval?: string): number {
   const parsed = Number(interval);
   if (parsed > 0) {
      return Math.max(MIN_POLL_INTERVAL_MS, parsed);
   }
   return DEFAULT_POLL_INTERVAL_MS;
}

function findMaxIndex(entries: DriverTranscriptEntry[]): number {
   let max = -1;
   for (const entry of entries) {
      if (entry.index > max) {
         max = entry.index;
      }
   }
   return max;
}

function emitEntries(
   entries: DriverTranscriptEntry[],
   options: TailActionOptions,
   state: TailEmissionState,
): boolean {
   for (const entry of entries) {
      printStreamEntry(entry, options);
      state.emitted += 1;
      if (entry.index > state.lastIndex) {
         state.lastIndex = entry.index;
      }
      if (
         options.stopAfterCount !== undefined &&
         state.emitted >= options.stopAfterCount
      ) {
         return true;
      }
   }
   return false;
}

function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => {
      setTimeout(resolve, ms);
   });
}

function collectPendingEntries(
   entries: DriverTranscriptEntry[],
   lastIndex: number,
): DriverTranscriptEntry[] {
   const pending: DriverTranscriptEntry[] = [];
   for (const entry of entries) {
      if (entry.index > lastIndex) {
         pending.push(entry);
      }
   }
   return pending;
}

function notifySessionEnded(json?: boolean): void {
   if (!json) {
      process.stdout.write('\nSession ended.\n');
   }
}

interface PollerContext {
   core: typeof Core;
   intervalMs: number;
   options: TailActionOptions;
   sessionId: string;
   signal: { stopped: boolean };
   state: TailEmissionState;
}

async function isSessionActive(sessionId: string, core: typeof Core): Promise<boolean> {
   const active = await core.getActiveDriverSession();
   return active?.sessionId === sessionId;
}

async function pollNextTick(context: PollerContext): Promise<void> {
   await sleep(context.intervalMs);
   if (context.signal.stopped) {
      return;
   }

   if (!(await isSessionActive(context.sessionId, context.core))) {
      notifySessionEnded(context.options.json);
      return;
   }

   const current = await context.core.runDriverSessionAction({ action: 'transcript' });
   const pending = collectPendingEntries(
      current.state.transcript,
      context.state.lastIndex,
   );

   if (emitEntries(pending, context.options, context.state)) {
      return;
   }

   await pollNextTick(context);
}

async function pollNewAnnouncements(context: PollerContext): Promise<void> {
   const cleanup = (): void => {
      context.signal.stopped = true;
   };

   process.on('SIGINT', cleanup);
   process.on('SIGTERM', cleanup);

   try {
      await pollNextTick(context);
   } finally {
      process.off('SIGINT', cleanup);
      process.off('SIGTERM', cleanup);
   }
}

export async function executeTailAction(options: TailActionOptions): Promise<void> {
   const [{ createNoSessionError }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('#core'),
   ]);
   const session = await core.getActiveDriverSession();
   if (!session) {
      throw createNoSessionError();
   }

   const intervalMs = resolveIntervalMs(options.interval),
      linesCount = resolveLinesCount(options.lines);
   const initial = await core.runDriverSessionAction({ action: 'transcript' });
   const initialEntries = options.since
      ? core.selectTranscriptEntries(initial.state.transcript, { since: options.since })
      : resolveInitialEntries(initial.state.transcript, options, linesCount);

   const state: TailEmissionState = {
      emitted: 0,
      lastIndex: findMaxIndex(initial.state.transcript),
   };

   if (emitEntries(initialEntries, options, state)) {
      return;
   }

   await pollNewAnnouncements({
      core,
      intervalMs,
      options,
      sessionId: session.sessionId,
      signal: { stopped: false },
      state,
   });
}

async function handleTailInvocation(options: TailActionOptions): Promise<void> {
   try {
      await executeTailAction(options);
   } catch (error) {
      const [{ normalizeError }, { errorLine }] = await Promise.all([
         import('../lib/helpers.js'),
         import('../lib/format.js'),
      ]);
      const normalized = normalizeError(error);
      process.exitCode = normalized.exitCode;
      if (options.json) {
         process.stdout.write(
            `${JSON.stringify({
               ok: false,
               family: 'sr',
               subcommand: 'tail',
               errors: normalized.errors,
            })}\n`,
         );
         return;
      }
      const first = normalized.errors[0];
      process.stderr.write(
         `${errorLine(first?.code ?? 'error', first?.message ?? String(error))}\n`,
      );
   }
}

function configureTailCommand(command: Command): Command {
   return addPhraseOption(
      addDriveActionOptions(
         command
            .option(
               '--lines <count>',
               'Number of recent phrases to print before streaming (default 10, 0 for none).',
            )
            .option('--since <checkpoint>', 'Only entries after the named checkpoint.')
            .option('--interval <ms>', 'Polling interval in milliseconds (default 250).'),
      ),
   );
}

export function registerTailCommand(driveCommand: Command): void {
   configureTailCommand(
      driveCommand
         .command('tail')
         .helpGroup(DRIVE_GROUPS.check)
         .summary('Continuously stream new screen reader announcements in real time.')
         .description(
            'Continuously stream new screen reader announcements in real time. ' +
               'Aliases: follow, stream, watch.',
         ),
   ).action(handleTailInvocation);

   for (const alias of ['follow', 'stream', 'watch'] as const) {
      configureTailCommand(driveCommand.command(alias, { hidden: true })).action(
         handleTailInvocation,
      );
   }
}
