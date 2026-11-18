import { readFile } from 'node:fs/promises';

import {
   evidenceRecordSchema,
   EVIDENCE_NOTE_MAX_LENGTH,
   type EvidenceRecord,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import { appendLineUnlocked, withPathLock, writeAtomic } from '../files/store.js';
import { resolveEvidenceFile } from './paths.js';

/**
 * Where the judgments recorded by `a1 pattern record` live. JSON-line reads, appends, and
 * clears share a lock so concurrent calls cannot corrupt the file.
 */
export interface EvidenceStoreOptions {
   file?: string | undefined;
}

/** Two records describe the same check when target, row, and element agree. */
function keyOf(record: EvidenceRecord): string {
   return JSON.stringify([
      record.subject,
      record.test.exampleId,
      record.test.rowKey,
      record.pointer ?? '',
   ]);
}

function parseLine(
   line: string,
   file: string,
   lineNumber: number,
): EvidenceRecord | undefined {
   if (line.trim() === '') {
      return undefined;
   }
   try {
      const parsed = evidenceRecordSchema.safeParse(JSON.parse(line));
      // A well-formed line of another shape is not a pattern judgment, so it is skipped.
      return parsed.success ? parsed.data : undefined;
   } catch (error) {
      throw new CliUsageError(
         'evidence-corrupt',
         `${file}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
   }
}

async function readUnlocked(file: string): Promise<EvidenceRecord[]> {
   let body = '';
   try {
      body = await readFile(file, 'utf8');
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         return [];
      }
      throw new CliUsageError(
         'evidence-unreadable',
         `${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
   }
   const latest = new Map<string, EvidenceRecord>();
   for (const [index, line] of body.split('\n').entries()) {
      const record = parseLine(line, file, index + 1);
      if (record) {
         latest.set(keyOf(record), record);
      }
   }
   return [...latest.values()];
}

/** Stores one judgment. Recording the same row again replaces the earlier one on read. */
export async function recordEvidence(
   record: EvidenceRecord,
   options: EvidenceStoreOptions = {},
): Promise<{ record: EvidenceRecord; file: string }> {
   const file = resolveEvidenceFile(options.file);
   const parsed = evidenceRecordSchema.parse({
      ...record,
      ...(record.note === undefined
         ? {}
         : { note: record.note.slice(0, EVIDENCE_NOTE_MAX_LENGTH) }),
   });
   return withPathLock(file, async () => {
      await appendLineUnlocked(file, parsed);
      return { record: parsed, file };
   });
}

/** Reads the latest judgment for each row. A missing file is empty. */
export async function readEvidence(
   options: EvidenceStoreOptions = {},
): Promise<EvidenceRecord[]> {
   const file = resolveEvidenceFile(options.file);
   return withPathLock(file, () => readUnlocked(file));
}

/**
 * Drops recorded judgments for one target, or every judgment when no target is given.
 * Returns how many were removed.
 */
export async function clearEvidence(
   subject: string | undefined,
   options: EvidenceStoreOptions = {},
): Promise<number> {
   const file = resolveEvidenceFile(options.file);
   return withPathLock(file, async () => {
      const records = await readUnlocked(file);
      const kept =
         subject === undefined
            ? []
            : records.filter((record) => record.subject !== subject);
      if (kept.length === records.length) {
         return 0;
      }
      const body = kept.map((record) => JSON.stringify(record)).join('\n');
      await writeAtomic(file, kept.length > 0 ? `${body}\n` : '');
      return records.length - kept.length;
   });
}

/** Recorded judgments for one target. */
export async function readEvidenceForSubject(
   subject: string,
   options: EvidenceStoreOptions = {},
): Promise<EvidenceRecord[]> {
   const records = await readEvidence(options);
   return records.filter((record) => record.subject === subject);
}
