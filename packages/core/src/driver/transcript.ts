import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

import {
   driverTranscriptFormatSchema,
   driverTranscriptSchema,
   type AccessibilityDriverSession,
   type DriverStateSnapshot,
   type DriverTranscript,
   type DriverTranscriptEntry,
   type DriverTranscriptFormat,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';

const JSON_INDENT = 2;
const ISO_TIME_START = 11;
const ISO_TIME_END = 23;

/**
 * Keeps the timestamped transcript for one session. The broker calls `capture` after every
 * action so each phrase is stamped when it was produced, not when it was read back.
 */
export class TranscriptRecorder {
   readonly entries: DriverTranscriptEntry[] = [];
   private phraseCount = 0;
   private itemCount = 0;

   /** Appends every phrase spoken since the previous capture. */
   capture(state: DriverStateSnapshot): void {
      if (state.spokenPhraseLog.length < this.phraseCount) {
         // The reader restarted (the virtual target attaches a new document), so its
         // logs begin again at zero while the transcript keeps what was already said.
         this.phraseCount = 0;
         this.itemCount = 0;
      }
      const phrases = state.spokenPhraseLog.slice(this.phraseCount),
            items = state.itemTextLog.slice(this.itemCount),
            now = new Date().toISOString();
      phrases.forEach((phrase, offset) => {
         this.entries.push(this.buildEntry({ phrase, items, offset, phrases, now, state }));
      });
      this.phraseCount = state.spokenPhraseLog.length;
      this.itemCount = state.itemTextLog.length;
   }

   private buildEntry(args: {
      phrase: string;
      items: string[];
      offset: number;
      phrases: string[];
      now: string;
      state: DriverStateSnapshot;
   }): DriverTranscriptEntry {
      const entry: DriverTranscriptEntry = {
         index: this.entries.length,
         at: args.now,
         phrase: args.phrase,
      };
      const itemText = resolveItemText(args);
      if (itemText) {
         entry.itemText = itemText;
      }
      return entry;
   }

   addCheckpoint(label: string, at = new Date().toISOString()): void {
      this.entries.push({ index: this.entries.length, at, phrase: '', checkpoint: label });
   }

   /** Returns the snapshot with the transcript entries attached. */
   attach(state: DriverStateSnapshot): DriverStateSnapshot {
      return { ...state, transcript: [...this.entries] };
   }
}

function resolveItemText(args: {
   items: string[];
   offset: number;
   phrases: string[];
   state: DriverStateSnapshot;
}): string | undefined {
   if (args.items.length === args.phrases.length) {
      return args.items[args.offset] || undefined;
   }
   if (args.offset === args.phrases.length - 1) {
      return args.state.currentItemText ?? undefined;
   }
   return undefined;
}

export interface TranscriptSelection {
   /** Keep only entries after the last checkpoint with this label. */
   since?: string | undefined;
   /** Keep only the last N phrases (checkpoints between them are kept too). */
   tail?: number | undefined;
}

function sliceSinceCheckpoint(
   entries: DriverTranscriptEntry[],
   label: string,
): DriverTranscriptEntry[] {
   const position = entries.findLastIndex((entry) => entry.checkpoint === label);
   if (position === -1) {
      throw new CliUsageError(
         'checkpoint-not-found',
         `No checkpoint named "${label}" exists in this session.`,
         { checkpoint: label },
      );
   }
   return entries.slice(position + 1);
}

function sliceTail(entries: DriverTranscriptEntry[], tail: number): DriverTranscriptEntry[] {
   let phrases = 0;
   let start = entries.length;
   while (start > 0 && phrases < tail) {
      start -= 1;
      if (entries[start]?.checkpoint === undefined) {
         phrases += 1;
      }
   }
   return entries.slice(start);
}

/** Applies --since and --tail to a transcript, in that order. */
export function selectTranscriptEntries(
   entries: DriverTranscriptEntry[],
   selection: TranscriptSelection = {},
): DriverTranscriptEntry[] {
   let selected = entries;
   if (selection.since !== undefined) {
      selected = sliceSinceCheckpoint(selected, selection.since);
   }
   if (selection.tail !== undefined) {
      selected = sliceTail(selected, selection.tail);
   }
   return selected;
}

/** Builds the exportable transcript document from a session and its entries. */
export function buildDriverTranscript(
   session: Pick<AccessibilityDriverSession, 'target' | 'url' | 'startedAt'>,
   entries: DriverTranscriptEntry[],
): DriverTranscript {
   return driverTranscriptSchema.parse({
      target: session.target,
      url: session.url,
      startedAt: session.startedAt,
      exportedAt: new Date().toISOString(),
      entries,
   });
}

function formatClock(iso: string): string {
   return iso.slice(ISO_TIME_START, ISO_TIME_END);
}

function formatEntryLine(entry: DriverTranscriptEntry): string {
   if (entry.checkpoint !== undefined) {
      return `\n## ${entry.checkpoint} (${formatClock(entry.at)})\n`;
   }
   const item = entry.itemText && entry.itemText !== entry.phrase ? ` (${entry.itemText})` : '';
   return `${String(entry.index + 1)}. [${formatClock(entry.at)}] ${entry.phrase}${item}`;
}

/** Renders a transcript as Markdown: a heading, then numbered phrases with checkpoint subheadings. */
export function formatTranscriptMarkdown(transcript: DriverTranscript): string {
   const phraseCount = transcript.entries.filter((entry) => entry.checkpoint === undefined).length,
         title = transcript.url ? `${transcript.target} on ${transcript.url}` : transcript.target;
   const lines = [
      `# Transcript: ${title}`,
      '',
      `Started ${transcript.startedAt}. Exported ${transcript.exportedAt}. ${String(phraseCount)} phrases.`,
      '',
      ...transcript.entries.map(formatEntryLine),
   ];
   return `${lines.join('\n').replaceAll(/\n{3,}/gu, '\n\n')}\n`;
}

/** Renders a transcript in the requested format. */
export function formatTranscript(
   transcript: DriverTranscript,
   format: DriverTranscriptFormat,
): string {
   if (format === 'md') {
      return formatTranscriptMarkdown(transcript);
   }
   return `${JSON.stringify(transcript, undefined, JSON_INDENT)}\n`;
}

/** Picks the transcript format from an explicit choice or the output path's extension. */
export function resolveTranscriptFormat(
   outPath: string,
   format?: string,
): DriverTranscriptFormat {
   if (format !== undefined) {
      const parsed = driverTranscriptFormatSchema.safeParse(format);
      if (!parsed.success) {
         throw new CliUsageError('validation-error', 'Transcript format must be json or md.', {
            field: 'format',
            value: format,
         });
      }
      return parsed.data;
   }
   const extension = extname(outPath).toLowerCase();
   if (extension === '.md' || extension === '.markdown') {
      return 'md';
   }
   if (extension === '.json') {
      return 'json';
   }
   throw new CliUsageError(
      'validation-error',
      `Cannot infer a transcript format from "${outPath}"; use a .json or .md path or pass --format.`,
      { field: 'out', value: outPath },
   );
}

/** Writes a transcript file and returns its absolute path. */
export async function writeDriverTranscript(args: {
   transcript: DriverTranscript;
   outPath: string;
   format?: string | undefined;
   cwd?: string | undefined;
}): Promise<{ path: string; format: DriverTranscriptFormat }> {
   const format = resolveTranscriptFormat(args.outPath, args.format),
         path = resolve(args.cwd ?? process.cwd(), args.outPath);
   await mkdir(dirname(path), { recursive: true });
   await writeFile(path, formatTranscript(args.transcript, format), 'utf8');
   return { path, format };
}

/** The Markdown transcript that sits next to a recording file. */
export function resolveRecordingTranscriptPath(recordingPath: string): string {
   const extension = extname(recordingPath);
   return `${recordingPath.slice(0, recordingPath.length - extension.length)}.transcript.md`;
}
