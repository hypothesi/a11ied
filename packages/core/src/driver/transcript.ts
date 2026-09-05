import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

import {
   driverTranscriptFormatSchema,
   driverTranscriptSchema,
   type AccessibilityDriverSession,
   type DriverTranscript,
   type DriverTranscriptEntry,
   type DriverTranscriptFormat,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';

export {
   selectTranscriptEntries,
   TranscriptRecorder,
   type TranscriptSelection,
} from './transcript-recorder.js';

const JSON_INDENT = 2;
const ISO_TIME_START = 11;
const ISO_TIME_END = 23;

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

function pluralize(total: number, singular: string): string {
   return `${String(total)} ${total === 1 ? singular : `${singular}s`}`;
}

/**
 * Numbers the phrases 1, 2, 3 in the order they print. A checkpoint renders as a heading
 * and takes no number, so the numbering never skips.
 */
function formatEntryLines(entries: DriverTranscriptEntry[]): string[] {
   let number = 0;
   return entries.map((entry) => {
      if (entry.checkpoint !== undefined) {
         return `\n## ${entry.checkpoint} (${formatClock(entry.at)})\n`;
      }
      number += 1;
      const item =
         entry.itemText && entry.itemText !== entry.phrase ? ` (${entry.itemText})` : '';
      return `${String(number)}. [${formatClock(entry.at)}] ${entry.phrase}${item}`;
   });
}

/**
 * Renders a transcript as Markdown: a heading, then numbered phrases with checkpoint
 * subheadings.
 */
export function formatTranscriptMarkdown(transcript: DriverTranscript): string {
   const phraseCount = transcript.entries.filter(
         (entry) => entry.checkpoint === undefined,
      ).length,
      title = transcript.url
         ? `${transcript.target} on ${transcript.url}`
         : transcript.target;
   const lines = [
      `# Transcript: ${title}`,
      '',
      `Started ${transcript.startedAt}. Exported ${transcript.exportedAt}. ${pluralize(phraseCount, 'phrase')}.`,
      '',
      ...formatEntryLines(transcript.entries),
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
         throw new CliUsageError(
            'validation-error',
            'Transcript format must be json or md.',
            {
               field: 'format',
               value: format,
            },
         );
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
