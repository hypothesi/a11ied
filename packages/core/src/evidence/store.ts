import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
   evidenceRecordSchema,
   legacyEvidenceLineSchema,
   EVIDENCE_NOTE_MAX_LENGTH,
   type EvidenceRecord,
} from '@a11ied/contracts';

import { resolveEvidenceFile } from './paths.js';
import { withFileLock, writeTextAtomic } from '../files/atomic-json.js';
import { CliUsageError } from '../errors/cli-errors.js';
import {
   isVerifiedEvidence,
   validateEvidenceTest,
   validateEvidenceRecord,
   validateEvidenceRecords,
} from './validation.js';

/**
 * JSON-line reads, appends, and clears share a lock so concurrent calls cannot corrupt
 * provenance or discard another check's result.
 */
export interface EvidenceStoreOptions {
   file?: string | undefined;
   runFile?: string | undefined;
   wcagVersion?: string | undefined;
   expectedRunId?: string | undefined;
}

type EvidenceKeyParts = Pick<
   EvidenceRecord,
   'subject' | 'test' | 'pointer' | 'provenance'
>;

/** The one string two records about the same check agree on. */
function describeTest(test: EvidenceRecord['test']): string {
   if (test.kind === 'criterion') {
      return `criterion:${test.criterionId}:${test.procedureId}`;
   }
   return `patternRow:${test.exampleId}:${test.rowKey}`;
}

/** Two records describe the same check when target, test, and element agree. */
function keyOf(record: EvidenceKeyParts): string {
   return JSON.stringify([
      record.subject,
      describeTest(record.test),
      record.pointer ?? '',
      record.provenance
         ? [
              record.provenance.runId,
              record.provenance.checkId,
              record.provenance.environmentId,
              record.provenance.procedureVersion,
              record.provenance.states,
           ]
         : [],
   ]);
}

function truncateNote(note: string | undefined): string | undefined {
   if (note === undefined || note.length <= EVIDENCE_NOTE_MAX_LENGTH) {
      return note;
   }
   return note.slice(0, EVIDENCE_NOTE_MAX_LENGTH);
}

/** Store a validated result and return the exact record accepted by the shared boundary. */
export async function recordEvidence(
   record: EvidenceRecord,
   options: EvidenceStoreOptions = {},
): Promise<{
   record: EvidenceRecord;
   file: string;
}> {
   const file = resolveEvidenceFile(options.file);
   const note = truncateNote(record.note);
   const parsed = evidenceRecordSchema.parse(
      note === undefined ? record : { ...record, note },
   );

   validateEvidenceTest(parsed, parsed.provenance?.wcagVersion ?? options.wcagVersion);
   parsed.evidenceId ??= randomUUID();
   const validated = await validateEvidenceRecord(parsed, {
      runFile: options.runFile ?? resolve(dirname(file), 'run.json'),
      expectedRunId: options.expectedRunId,
   });
   if (parsed.provenance && !isVerifiedEvidence(validated)) {
      throw new CliUsageError(
         'evidence-invalid',
         validated.verification?.reasons.join(' ') ?? 'Evidence could not be verified.',
      );
   }
   await withFileLock(file, async () => {
      await appendFile(file, `${JSON.stringify(validated)}\n`, {
         encoding: 'utf8',
         mode: 0o600,
      });
   });
   return { record: validated, file };
}

/**
 * A line written before the record could be about anything but a criterion put the
 * criterion and the procedure at the top level. Those are lifted into the `test` field on
 * read, so an existing results file keeps working.
 */
function liftLegacyLine(value: unknown): unknown {
   if (typeof value !== 'object' || value === null || 'test' in value) {
      return value;
   }
   const legacy = legacyEvidenceLineSchema.safeParse(value);
   if (!legacy.success) {
      return value;
   }
   const { criterionId, procedureId, ...rest } = legacy.data;
   return { ...rest, test: { kind: 'criterion', criterionId, procedureId } };
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
      return evidenceRecordSchema.parse(liftLegacyLine(JSON.parse(line)));
   } catch (error) {
      throw new CliUsageError(
         'evidence-corrupt',
         `${file}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
   }
}

/**
 * Reads every recorded result, keeping the last one written for each check.
 *
 * Missing files are empty. Corrupt or unreadable files produce diagnostics; imported
 * verification labels are replaced with a current assessment.
 */
async function readEvidenceUnlocked(
   options: EvidenceStoreOptions,
): Promise<EvidenceRecord[]> {
   const file = resolveEvidenceFile(options.file);
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
   return validateEvidenceRecords([...latest.values()], {
      runFile: options.runFile ?? resolve(dirname(file), 'run.json'),
      expectedRunId: options.expectedRunId,
   });
}

/**
 * Drops recorded results for one target, or every result when no target is given. Returns
 * how many rows were removed.
 */
async function clearEvidenceUnlocked(
   subject: string | undefined,
   options: EvidenceStoreOptions,
): Promise<number> {
   const file = resolveEvidenceFile(options.file);
   const records = await readEvidenceUnlocked(options);
   const kept =
      subject === undefined ? [] : records.filter((record) => record.subject !== subject);

   if (kept.length === records.length) {
      return 0;
   }

   const body = kept.map((record) => JSON.stringify(record)).join('\n');
   await writeTextAtomic(kept.length > 0 ? `${body}\n` : '', file);
   return records.length - kept.length;
}

/**
 * Appends one recorded result. Recording the same check twice replaces the earlier one on
 * read.
 */
export async function appendEvidence(
   record: EvidenceRecord,
   options: EvidenceStoreOptions = {},
): Promise<string> {
   const result = await recordEvidence(record, options);
   return result.file;
}

/** Read and revalidate the latest records in each distinct assessment scope. */
export async function readEvidence(
   options: EvidenceStoreOptions = {},
): Promise<EvidenceRecord[]> {
   const file = resolveEvidenceFile(options.file);
   return withFileLock(file, () => readEvidenceUnlocked(options));
}

/** Remove results atomically while preserving concurrent appends for other subjects. */
export async function clearEvidence(
   subject: string | undefined,
   options: EvidenceStoreOptions = {},
): Promise<number> {
   const file = resolveEvidenceFile(options.file);
   return withFileLock(file, () => clearEvidenceUnlocked(subject, options));
}

/** Recorded results for one target. */
export async function readEvidenceForSubject(
   subject: string,
   options: EvidenceStoreOptions = {},
): Promise<EvidenceRecord[]> {
   const records = await readEvidence(options);
   return records.filter((record) => record.subject === subject);
}
