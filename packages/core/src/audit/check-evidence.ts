import type { AssessmentCheck, AuditRun, EvidenceRecord } from '@a11ied/contracts';
import { CliUsageError } from '../errors/cli-errors.js';
import { readEvidence } from '../evidence/store.js';
import { isVerifiedEvidence } from '../evidence/validation.js';
import { getAuditRunPaths } from './run-store.js';

/** Revalidate saved files against the locked run before changing completion state. */
export async function readRunEvidence(input: {
   file: string;
   run: AuditRun;
}): Promise<EvidenceRecord[]> {
   return readEvidence({
      file: getAuditRunPaths(input.file).evidenceFile,
      runFile: input.file,
      expectedRunId: input.run.runId,
   });
}

/** A result references the current saved proof, never an arbitrary evidence label. */
export function assertCheckEvidence(input: {
   check: AssessmentCheck;
   records: EvidenceRecord[];
}): void {
   const { check, records } = input;
   const ids = new Set(check.evidenceIds);
   if (!check.outcome || ids.size === 0 || ids.size !== check.evidenceIds.length) {
      throw new CliUsageError(
         'audit-evidence-invalid',
         'An evaluated check requires an outcome and unique evidence references.',
      );
   }
   const selected = records.filter((record) => ids.has(record.evidenceId ?? ''));
   const invalid = selected.some(function isInvalid(record): boolean {
      return (
         !isVerifiedEvidence(record) ||
         record.provenance?.checkId !== check.checkId ||
         record.outcome !== check.outcome
      );
   });
   if (!check.attemptStartedAt || selected.length !== ids.size || invalid) {
      throw new CliUsageError(
         'audit-evidence-invalid',
         `Check ${check.checkId} requires verified evidence from its current attempt.`,
      );
   }
   const conflicting = records.some(function isConflicting(record): boolean {
      return (
         record.provenance?.checkId === check.checkId &&
         isVerifiedEvidence(record) &&
         record.outcome !== check.outcome
      );
   });
   if (conflicting) {
      throw new CliUsageError(
         'audit-evidence-conflict',
         `Check ${check.checkId} has conflicting saved outcomes.`,
      );
   }
}

/** Recovery and status use the same acceptance boundary as result completion. */
export function getCheckEvidenceError(input: {
   check: AssessmentCheck;
   records: EvidenceRecord[];
}): string | undefined {
   try {
      assertCheckEvidence(input);
      return undefined;
   } catch (error) {
      if (error instanceof CliUsageError) {
         return error.message;
      }
      throw error;
   }
}
