import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
   evidenceRecordSchema,
   EVIDENCE_NOTE_MAX_LENGTH,
   type EvidenceRecord,
} from '@a11ied/contracts';

import { resolveEvidenceFile } from './paths.js';

/**
 * Recorded results are stored one JSON object per line, so `a1 audit record` appends
 * without reading the file first. Several agent tool calls can record at once, and an
 * append of a single line under `EVIDENCE_NOTE_MAX_LENGTH` lands in one write, so the
 * lines never interleave. A rewritten JSON array would need a lock to be safe.
 */
export interface EvidenceStoreOptions {
   file?: string | undefined;
}

type EvidenceKeyParts = Pick<
   EvidenceRecord,
   'subject' | 'criterionId' | 'procedureId' | 'pointer'
>;

/**
 * Two records describe the same check when target, criterion, procedure, and element
 * agree.
 */
function keyOf(record: EvidenceKeyParts): string {
   return [
      record.subject,
      record.criterionId,
      record.procedureId,
      record.pointer ?? '',
   ].join(' ');
}

function truncateNote(note: string | undefined): string | undefined {
   if (note === undefined || note.length <= EVIDENCE_NOTE_MAX_LENGTH) {
      return note;
   }
   return note.slice(0, EVIDENCE_NOTE_MAX_LENGTH);
}

/**
 * Appends one recorded result. Recording the same check twice replaces the earlier one on
 * read.
 */
export async function appendEvidence(
   record: EvidenceRecord,
   options: EvidenceStoreOptions = {},
): Promise<string> {
   const file = resolveEvidenceFile(options.file);
   const note = truncateNote(record.note);
   const parsed = evidenceRecordSchema.parse(
      note === undefined ? record : { ...record, note },
   );

   await mkdir(dirname(file), { recursive: true });
   await appendFile(file, `${JSON.stringify(parsed)}\n`, 'utf8');
   return file;
}

function parseLine(line: string): EvidenceRecord | undefined {
   if (line.trim() === '') {
      return undefined;
   }
   try {
      const parsed = evidenceRecordSchema.safeParse(JSON.parse(line));
      return parsed.success ? parsed.data : undefined;
   } catch {
      return undefined;
   }
}

/**
 * Reads every recorded result, keeping the last one written for each check.
 *
 * A line that does not parse is skipped rather than throwing. The file is an append log
 * that a person may hand-edit, and one bad line must not make the rest unreadable.
 */
export async function readEvidence(
   options: EvidenceStoreOptions = {},
): Promise<EvidenceRecord[]> {
   const file = resolveEvidenceFile(options.file);
   let body = '';
   try {
      body = await readFile(file, 'utf8');
   } catch {
      return [];
   }

   const latest = new Map<string, EvidenceRecord>();
   for (const line of body.split('\n')) {
      const record = parseLine(line);
      if (record) {
         latest.set(keyOf(record), record);
      }
   }
   return [...latest.values()];
}

/** Recorded results for one target. */
export async function readEvidenceForSubject(
   subject: string,
   options: EvidenceStoreOptions = {},
): Promise<EvidenceRecord[]> {
   const records = await readEvidence(options);
   return records.filter((record) => record.subject === subject);
}

/**
 * Drops recorded results for one target, or every result when no target is given. Returns
 * how many rows were removed.
 */
export async function clearEvidence(
   subject: string | undefined,
   options: EvidenceStoreOptions = {},
): Promise<number> {
   const file = resolveEvidenceFile(options.file);
   const records = await readEvidence(options);
   const kept =
      subject === undefined ? [] : records.filter((record) => record.subject !== subject);

   if (kept.length === records.length) {
      return 0;
   }

   const body = kept.map((record) => JSON.stringify(record)).join('\n');
   await mkdir(dirname(file), { recursive: true });
   await writeFile(file, kept.length > 0 ? `${body}\n` : '', 'utf8');
   return records.length - kept.length;
}
