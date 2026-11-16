import {
   auditRunSchema,
   type AssessmentCheck,
   type AuditJourney,
   type AuditRun,
   type AuditState,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import {
   getAssessmentId,
   getAssessmentCheckId,
   listStateEnvironmentIds,
   updateAuditRun,
   withRunTransaction,
   type RunTransaction,
} from './run-store.js';
export {
   getAssessmentId,
   getAssessmentCheckId,
   listStateEnvironmentIds,
   updateAuditRun,
   withRunTransaction,
   type RunTransaction,
};
import {
   isAssessmentScopeSupported,
   resolveEvidenceProcedure,
} from '../evidence/validation.js';
import { listApgRowKeys } from '../apg/runtime.js';
import { WcagEngineNotFoundError } from '@a11ied/wcag-engine';

function assertQueuedPatternRow(
   patternRow: NonNullable<AssessmentCheck['patternRow']>,
): void {
   try {
      if (listApgRowKeys(patternRow.exampleId).includes(patternRow.rowKey)) {
         return;
      }
   } catch (error) {
      if (!(error instanceof WcagEngineNotFoundError)) {
         throw error;
      }
   }
   throw new CliUsageError(
      'pattern-row-not-found',
      'The queued APG example or row does not exist.',
   );
}

function assertQueuedProcedure(
   check: Pick<
      AssessmentCheck,
      'criterionId' | 'procedureId' | 'procedureVersion' | 'scope' | 'patternRow'
   >,
   wcagVersion: string,
): void {
   const procedure = resolveEvidenceProcedure({ ...check, wcagVersion });
   if (check.procedureVersion !== procedure.version) {
      throw new CliUsageError(
         'audit-procedure-version-invalid',
         'The queued procedure version must match the current WCAG catalog.',
      );
   }
   if (
      !isAssessmentScopeSupported({ scope: check.scope, procedureScope: procedure.scope })
   ) {
      throw new CliUsageError(
         'audit-procedure-scope-invalid',
         'The queued scope must match the catalog scope or add an explicit widget check.',
      );
   }
   if (check.patternRow) {
      assertQueuedPatternRow(check.patternRow);
   }
}

function invalidateJourneyCompletion(
   journey: AuditJourney,
   reason: string,
): AuditJourney {
   return journey.status === 'completed'
      ? { ...journey, status: 'discovered', reason }
      : journey;
}

function invalidateStateJourneys(run: AuditRun, stateId: string): void {
   const reason =
      'A constituent state changed. Traverse the current journey before completing it.';
   run.journeys = run.journeys.map((journey) =>
      journey.stateIds.includes(stateId)
         ? invalidateJourneyCompletion(journey, reason)
         : journey,
   );
}

/** Save a distinct observed state, invalidating assessments if that state changes. */
export async function registerAuditState(input: {
   file: string;
   state: Omit<AuditState, 'stateId' | 'revision' | 'observedAt'> & {
      stateId?: string | undefined;
   };
}): Promise<AuditRun> {
   return updateAuditRun({
      file: input.file,
      change(run) {
         const stateId =
            input.state.stateId ??
            getAssessmentId('state', [
               input.state.target.kind,
               input.state.target.value,
               input.state.label,
               input.state.fingerprint,
               input.state.environmentId,
            ]);
         const previous = run.states.find((state) => state.stateId === stateId);
         const changed =
            previous !== undefined &&
            (previous.fingerprint !== input.state.fingerprint ||
               previous.observationDigest !== input.state.observationDigest ||
               previous.target.value !== input.state.target.value ||
               previous.target.kind !== input.state.target.kind ||
               previous.environmentId !== input.state.environmentId);
         const state: AuditState = {
            ...input.state,
            stateId,
            revision: previous ? previous.revision + Number(changed) : 1,
            observedAt:
               previous && !changed ? previous.observedAt : new Date().toISOString(),
         };
         run.states = [...run.states.filter((item) => item.stateId !== stateId), state];
         if (!previous || changed) {
            invalidateStateJourneys(run, stateId);
            run.checks = run.checks.map((check) => {
               const matches =
                  check.stateIds.includes(stateId) ||
                  (check.scope === 'site' &&
                     (check.environmentId === state.environmentId ||
                        check.environmentId === previous?.environmentId));
               return matches
                  ? {
                       ...check,
                       status: 'stale',
                       updatedAt: state.observedAt,
                       reason: 'The observed state changed.',
                    }
                  : check;
            });
            run.status = 'active';
         }
         return run;
      },
   });
}

/** Journeys preserve ordered states even when their steps span several pages. */
export async function registerAuditJourney(input: {
   file: string;
   journey: AuditJourney;
}): Promise<AuditRun> {
   return updateAuditRun({
      file: input.file,
      change(run) {
         const previous = run.journeys.find(
            (journey) => journey.journeyId === input.journey.journeyId,
         );
         const changed =
            previous !== undefined &&
            JSON.stringify(previous.stateIds) !== JSON.stringify(input.journey.stateIds);
         const journey = changed
            ? invalidateJourneyCompletion(
                 input.journey,
                 'The journey steps changed. Traverse the current journey before completing it.',
              )
            : input.journey;
         if (!previous || changed) {
            const environments = listStateEnvironmentIds(run, [
               ...(previous?.stateIds ?? []),
               ...input.journey.stateIds,
            ]);
            run.checks = run.checks.map((check) =>
               check.journeyId === input.journey.journeyId ||
               (check.scope === 'site' && environments.has(check.environmentId))
                  ? {
                       ...check,
                       stateIds:
                          check.scope === 'journey'
                             ? input.journey.stateIds
                             : check.stateIds,
                       status: 'stale',
                       updatedAt: new Date().toISOString(),
                       reason: 'The journey steps changed.',
                    }
                  : check,
            );
            run.status = 'active';
         }
         run.journeys = [
            ...run.journeys.filter((item) => item.journeyId !== input.journey.journeyId),
            journey,
         ];
         if (previous?.status !== journey.status || previous?.reason !== journey.reason) {
            run.status = 'active';
         }
         return run;
      },
   });
}

/** Add a coverage obligation once; repeating discovery cannot discard its evidence. */
export async function queueAssessmentCheck(input: {
   file: string;
   check: Pick<
      AssessmentCheck,
      | 'criterionId'
      | 'procedureId'
      | 'procedureVersion'
      | 'patternRow'
      | 'scope'
      | 'stateIds'
      | 'pointer'
      | 'journeyId'
      | 'environmentId'
   >;
}): Promise<AuditRun> {
   return updateAuditRun({
      file: input.file,
      change(run) {
         assertQueuedProcedure(input.check, run.profile.wcagVersion);
         const checkId = getAssessmentCheckId(input.check);
         const candidate: AssessmentCheck = {
            ...input.check,
            checkId,
            status: 'queued',
            attempts: 0,
            evidenceIds: [],
            updatedAt: new Date().toISOString(),
         };
         auditRunSchema.parse({
            ...run,
            checks: [
               ...run.checks.filter((check) => check.checkId !== checkId),
               candidate,
            ],
         });
         if (!run.checks.some((check) => check.checkId === checkId)) {
            run.checks.push(candidate);
            run.status = 'active';
         }
         return run;
      },
   });
}

const TRANSITIONS: Record<AssessmentCheck['status'], AssessmentCheck['status'][]> = {
   queued: ['running', 'blocked', 'unsupported'],
   running: ['evaluated', 'blocked', 'unsupported', 'stale'],
   evaluated: ['stale'],
   blocked: ['blocked', 'queued', 'stale'],
   unsupported: ['queued', 'stale'],
   stale: ['queued'],
};

/** Shared claims keep library transitions and coordinator selection consistent. */
export function startAssessmentCheck(check: AssessmentCheck): void {
   // A retry must start after the previous transition even within one clock tick.
   const start = Math.max(
      Date.now(),
      check.attempts > 0 ? Date.parse(check.updatedAt) + 1 : 0,
      check.attemptStartedAt ? Date.parse(check.attemptStartedAt) + 1 : 0,
   );
   const now = new Date(start).toISOString();
   Object.assign(check, {
      status: 'running',
      updatedAt: now,
      attempts: check.attempts + 1,
      attemptStartedAt: now,
      outcome: undefined,
      evidenceIds: [],
      reason: undefined,
   });
}

interface AssessmentTransitionInput {
   file: string;
   checkId: string;
   status: AssessmentCheck['status'];
   outcome?: AssessmentCheck['outcome'] | undefined;
   evidenceIds?: string[] | undefined;
   reason?: string | undefined;
}

function assertTransitionAllowed(
   run: AuditRun,
   check: AssessmentCheck | undefined,
   input: AssessmentTransitionInput,
): asserts check is AssessmentCheck {
   if (!check || !TRANSITIONS[check.status].includes(input.status)) {
      throw new CliUsageError(
         'audit-transition-invalid',
         `Cannot transition check ${input.checkId} to ${input.status}.`,
      );
   }
   const hasRunningCheck =
      input.status === 'running' &&
      (run.activeCheckIds.length > 0 ||
         run.checks.some((item) => item.status === 'running'));
   if (hasRunningCheck) {
      throw new CliUsageError(
         'audit-check-running',
         'Finish or recover the running check before claiming another.',
      );
   }
}

function applyTransition(
   run: AuditRun,
   check: AssessmentCheck,
   input: AssessmentTransitionInput,
): void {
   Object.assign(check, {
      status: input.status,
      updatedAt: input.status === 'running' ? check.updatedAt : new Date().toISOString(),
      reason: input.reason,
      ...(input.status === 'evaluated'
         ? { outcome: input.outcome, evidenceIds: input.evidenceIds ?? [] }
         : {}),
   });
   if (input.status === 'running') {
      startAssessmentCheck(check);
      if (!run.activeCheckIds.includes(check.checkId)) {
         run.activeCheckIds.push(check.checkId);
      }
   } else if (run.activeCheckIds.includes(check.checkId)) {
      run.activeCheckIds = run.activeCheckIds.filter((id) => id !== check.checkId);
   }
   run.status = 'active';
}

/** Separate work status from its result; an attempt never implies a passing outcome. */
export async function transitionAssessmentCheck(
   input: AssessmentTransitionInput,
): Promise<AuditRun> {
   if (input.status === 'evaluated') {
      if (!input.outcome) {
         throw new CliUsageError(
            'audit-evidence-invalid',
            'An evaluated check requires an outcome and unique evidence references.',
         );
      }
      return withRunTransaction(input.file, (tx) =>
         tx.evaluateCheck({
            checkId: input.checkId,
            outcome: input.outcome as NonNullable<AssessmentCheck['outcome']>,
            evidenceIds: input.evidenceIds ?? [],
            reason: input.reason,
         }),
      );
   }
   return updateAuditRun({
      file: input.file,
      async change(run) {
         const check = run.checks.find((item) => item.checkId === input.checkId);
         assertTransitionAllowed(run, check, input);
         applyTransition(run, check, input);
         return run;
      },
   });
}
