import type {
   AssessmentCapability,
   AssessmentScope,
   AssessmentCheck,
   AssessmentProcedure,
   AuditRun,
} from '@a11ied/contracts';
import { getCanonicalPath, withPathLock } from '../files/store.js';
import { CliUsageError } from '../errors/cli-errors.js';
import {
   getMissingCapabilities,
   getRequiredCapabilities,
} from '../evidence/procedure-requirements.js';
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

/** Keep source scope and proof locked through a consuming report transaction. */
export async function withAuditAssessmentSnapshot<TResult>(
   file: string,
   consume: (snapshot: AuditAssessmentSnapshot) => Promise<TResult>,
): Promise<TResult> {
   const canonicalFile = await getCanonicalPath(file);
   return withPathLock(canonicalFile, async () => {
      const run = await readAuditRun(canonicalFile);
      const snapshot = await buildAuditAssessmentSnapshot({ file: canonicalFile, run });
      return consume(snapshot);
   });
}

/** A read holds the coordinator lock while evidence and scope are revalidated. */
export async function getAuditAssessmentSnapshot(
   file: string,
): Promise<AuditAssessmentSnapshot> {
   return withAuditAssessmentSnapshot(file, async (snapshot) => snapshot);
}

/** Coverage refers to the same locked view of the run and its current proof. */
export async function getAuditAssessmentStatus(
   file: string,
): Promise<AuditAssessmentStatus> {
   const snapshot = await getAuditAssessmentSnapshot(file);
   return snapshot.status;
}

function getQueuedChecks(run: AuditRun): AssessmentCheck[] {
   const stateTargets = new Map(
         run.states.map((state) => [state.stateId, state.target.value]),
      ),
      targets = [
         ...new Set(
            run.checks.flatMap((check) => {
               const checkTargets = check.stateIds.flatMap((stateId) => {
                  const target = stateTargets.get(stateId);
                  return target ? [target] : [];
               });
               return checkTargets;
            }),
         ),
      ];
   const queued = run.checks.filter((entry) => entry.status === 'queued');
   queued.sort((first, second) => {
      const firstTarget = stateTargets.get(first.stateIds[0] ?? ''),
         secondTarget = stateTargets.get(second.stateIds[0] ?? '');
      const firstOrder =
            first.scope !== 'site' && first.scope !== 'journey'
               ? targets.indexOf(firstTarget ?? '')
               : targets.length,
         secondOrder =
            second.scope !== 'site' && second.scope !== 'journey'
               ? targets.indexOf(secondTarget ?? '')
               : targets.length;

      return firstOrder - secondOrder;
   });
   return queued;
}

function assertNoRunningChecks(run: AuditRun): void {
   if (
      run.activeCheckIds.length > 0 ||
      run.checks.some((check) => check.status === 'running')
   ) {
      throw new CliUsageError(
         'audit-check-running',
         'A check is already running. Complete it or resume with an explicit recovery decision.',
      );
   }
}

function getBatchKey(check: AssessmentCheck): string {
   return JSON.stringify([check.environmentId, [...check.stateIds].toSorted()]);
}

function isClaimable(
   run: AuditRun,
   check: AssessmentCheck,
   excludeCapabilities: readonly AssessmentCapability[],
): boolean {
   const procedure = resolveEvidenceProcedure({
      ...check,
      wcagVersion: run.profile.wcagVersion,
   });
   if (
      getRequiredCapabilities(procedure, true).some((capability) =>
         excludeCapabilities.includes(capability),
      )
   ) {
      return false;
   }
   const environment = run.environments.find(
      (entry) => entry.environmentId === check.environmentId,
   );
   const missing = getMissingCapabilities({
      procedure,
      capabilities: environment?.capabilities ?? [],
      isInapplicable: true,
   });
   if (missing.length > 0) {
      Object.assign(check, {
         status: 'unsupported',
         reason: `Required capabilities are unavailable: ${missing.join(', ')}.`,
         updatedAt: new Date().toISOString(),
      });
      return false;
   }
   return (
      check.scope !== 'site' ||
      run.states.some((state) => state.environmentId === check.environmentId)
   );
}

export interface NextAuditAssessmentOptions {
   checkIds?: readonly string[] | undefined;
   count?: number;
   excludeCapabilities?: readonly AssessmentCapability[];
   scopes?: readonly AssessmentScope[] | undefined;
}

function selectNextChecks(
   run: AuditRun,
   options: NextAuditAssessmentOptions & { count: number },
): AssessmentCheck[] {
   const { count, excludeCapabilities = [], scopes, checkIds } = options;
   assertNoRunningChecks(run);
   const candidates: AssessmentCheck[] = [];
   const selected = getQueuedChecks(run).filter(
      (check) =>
         (!scopes || scopes.includes(check.scope)) &&
         (!checkIds || checkIds.includes(check.checkId)),
   );
   for (const check of selected) {
      if (candidates.length >= count) {
         break;
      }
      if (isClaimable(run, check, excludeCapabilities)) {
         candidates.push(check);
      }
   }
   // Batch claim: only checks sharing the top state (same environment and stateIds) claim together.
   const batchKey = candidates[0] ? getBatchKey(candidates[0]) : undefined;
   const shared = candidates.filter(
      (check) => batchKey !== undefined && getBatchKey(check) === batchKey,
   );
   for (const check of shared) {
      startAssessmentCheck(check);
      if (!run.activeCheckIds.includes(check.checkId)) {
         run.activeCheckIds.push(check.checkId);
      }
   }
   return shared;
}

/**
 * Claim one or more obligations atomically and return their setup, actions, and proof
 * requirements.
 */
export async function nextAuditAssessment(
   file: string,
   options: NextAuditAssessmentOptions = {},
): Promise<{
   run: AuditRun;
   checks?: AssessmentCheck[];
   procedures?: AssessmentProcedure[];
}> {
   const count = options.count ?? 1;
   const run = await updateAuditRun({
      file,
      change(current) {
         const previousCount = current.checks.length;
         queueAssessmentObligations(current);
         selectNextChecks(current, { ...options, count });
         if (
            current.activeCheckIds.length > 0 ||
            current.checks.length !== previousCount
         ) {
            current.status = 'active';
         }
         return current;
      },
   });
   const selected = run.checks.filter((check) => check.status === 'running');
   if (selected.length === 0) {
      return { run };
   }
   return {
      run,
      checks: selected,
      procedures: selected.map((check) =>
         resolveEvidenceProcedure({
            ...check,
            wcagVersion: run.profile.wcagVersion,
         }),
      ),
   };
}

/** Interrupted work stays blocked; only explicitly selected checks are retried. */
export async function resumeAuditAssessment(input: {
   file: string;
   retryCheckIds?: string[];
   onlyIfIdle?: boolean;
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
         if (input.onlyIfIdle) {
            assertNoRunningChecks(current);
         }
         const records = await readRunEvidence({ file: input.file, run: current });
         for (const check of current.checks) {
            if (
               check.status === 'running' ||
               current.activeCheckIds.includes(check.checkId)
            ) {
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
         current.activeCheckIds = [];
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
