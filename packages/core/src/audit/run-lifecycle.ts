import type { AssessmentCheck, AssessmentProcedure, AuditRun } from '@a11ied/contracts';
import { getCanonicalPath, withFileLock } from '../files/atomic-json.js';
import { CliUsageError } from '../errors/cli-errors.js';
import { resolveEvidenceProcedure } from '../evidence/validation.js';
import {
   createAuditRun,
   readAuditRun,
   updateAuditRun,
   type CreateAuditRunOptions,
} from './run-store.js';
import { queueAssessmentObligations } from './run-obligations.js';
import { migrateInventoryAuditRun } from './run-inventory.js';
import { startAssessmentCheck } from './run-state.js';
import { getCheckEvidenceError, readRunEvidence } from './check-evidence.js';
import {
   buildAuditAssessmentSnapshot,
   buildAuditAssessmentStatus,
   type AuditAssessmentSnapshot,
   type AuditAssessmentStatus,
} from './run-status.js';

/** Create the durable coordinator without performing actions on the target. */
export async function startAuditAssessment(options: CreateAuditRunOptions): Promise<{
   file: string;
   evidenceFile: string;
   artifactsDir: string;
   status: AuditAssessmentStatus;
}> {
   const created = options.inventoryPath
      ? await migrateInventoryAuditRun({
           ...options,
           inventoryPath: options.inventoryPath,
        })
      : await createAuditRun(options);
   const run = await updateAuditRun({
      file: created.file,
      change(current) {
         queueAssessmentObligations(current);
         return current;
      },
   });
   return {
      file: created.file,
      evidenceFile: created.evidenceFile,
      artifactsDir: created.artifactsDir,
      status: await buildAuditAssessmentStatus({ file: created.file, run }),
   };
}

/** A read holds the coordinator lock while evidence and scope are revalidated. */
export async function getAuditAssessmentSnapshot(
   file: string,
): Promise<AuditAssessmentSnapshot> {
   const canonicalFile = await getCanonicalPath(file);
   return withFileLock(canonicalFile, async () => {
      const run = await readAuditRun(canonicalFile);
      return buildAuditAssessmentSnapshot({ file: canonicalFile, run });
   });
}

/** Coverage refers to the same locked view of the run and its current proof. */
export async function getAuditAssessmentStatus(
   file: string,
): Promise<AuditAssessmentStatus> {
   const snapshot = await getAuditAssessmentSnapshot(file);
   return snapshot.status;
}

function selectNextCheck(run: AuditRun): AssessmentCheck | undefined {
   if (run.activeCheckId || run.checks.some((check) => check.status === 'running')) {
      throw new CliUsageError(
         'audit-check-running',
         'A check is already running. Complete it or resume with an explicit recovery decision.',
      );
   }
   for (const check of run.checks.filter((entry) => entry.status === 'queued')) {
      const procedure = resolveEvidenceProcedure({
         ...check,
         wcagVersion: run.profile.wcagVersion,
      });
      const environment = run.environments.find(
         (entry) => entry.environmentId === check.environmentId,
      );
      const missing = procedure.requiredCapabilities.filter(
         (capability) => !environment?.capabilities.includes(capability),
      );
      if (missing.length > 0) {
         Object.assign(check, {
            status: 'unsupported',
            reason: `Required capabilities are unavailable: ${missing.join(', ')}.`,
            updatedAt: new Date().toISOString(),
         });
      } else if (
         check.scope !== 'site' ||
         run.states.some((state) => state.environmentId === check.environmentId)
      ) {
         startAssessmentCheck(check);
         run.activeCheckId = check.checkId;
         return check;
      }
   }
   return undefined;
}

/** Claim one obligation atomically and return its setup, actions, and proof requirements. */
export async function nextAuditAssessment(file: string): Promise<{
   run: AuditRun;
   check?: AssessmentCheck;
   procedure?: AssessmentProcedure;
}> {
   const run = await updateAuditRun({
      file,
      change(current) {
         const previousCount = current.checks.length;
         queueAssessmentObligations(current);
         selectNextCheck(current);
         if (current.activeCheckId || current.checks.length !== previousCount) {
            current.status = 'active';
         }
         return current;
      },
   });
   const selected = run.checks.find((check) => check.status === 'running');
   if (!selected) {
      return { run };
   }
   return {
      run,
      check: selected,
      procedure: resolveEvidenceProcedure({
         ...selected,
         wcagVersion: run.profile.wcagVersion,
      }),
   };
}

/** Interrupted work stays blocked; only explicitly selected checks are retried. */
export async function resumeAuditAssessment(input: {
   file: string;
   retryCheckIds?: string[];
}): Promise<AuditAssessmentStatus> {
   const retries = new Set(input.retryCheckIds);
   const run = await updateAuditRun({
      file: input.file,
      async change(current) {
         if (
            [...retries].some(
               (id) => !current.checks.some((check) => check.checkId === id),
            )
         ) {
            throw new CliUsageError(
               'audit-check-not-found',
               'A requested retry does not belong to this run.',
            );
         }
         const records = await readRunEvidence({ file: input.file, run: current });
         for (const check of current.checks) {
            if (check.status === 'running' || check.checkId === current.activeCheckId) {
               Object.assign(check, {
                  status: 'blocked',
                  reason:
                     'Execution was interrupted. Inspect saved evidence and restore a safe state before an explicit retry.',
                  updatedAt: new Date().toISOString(),
               });
            } else if (retries.has(check.checkId)) {
               if (
                  check.status === 'evaluated' &&
                  check.outcome !== 'cantTell' &&
                  !getCheckEvidenceError({ check, records })
               ) {
                  throw new CliUsageError(
                     'audit-retry-invalid',
                     'A completed assessment cannot be replayed through resume.',
                  );
               }
               Object.assign(check, {
                  status: 'queued',
                  reason: undefined,
                  updatedAt: new Date().toISOString(),
               });
            }
         }
         current.activeCheckId = undefined;
         queueAssessmentObligations(current);
         current.status = 'active';
         return current;
      },
   });
   return buildAuditAssessmentStatus({ file: input.file, run });
}

/** Complete only validated scope; partial output preserves unresolved obligations. */
export async function finalizeAuditAssessment(input: {
   file: string;
   allowPartial?: boolean;
}): Promise<AuditAssessmentStatus> {
   const result: { status?: AuditAssessmentStatus } = {};
   const run = await updateAuditRun({
      file: input.file,
      async change(current) {
         const status = await buildAuditAssessmentStatus({
            file: input.file,
            run: current,
         });
         result.status = status;
         if (!status.complete && !input.allowPartial) {
            throw new CliUsageError(
               'audit-incomplete',
               `The audit has ${status.coverage.unresolved} unresolved checks and ${status.issues.length} coverage issues. Use partial reporting or finish the listed obligations.`,
            );
         }
         current.status = status.complete ? 'complete' : 'active';
         return current;
      },
   });
   if (!result.status) {
      throw new Error('The finalization status is missing.');
   }
   return { ...result.status, run };
}
