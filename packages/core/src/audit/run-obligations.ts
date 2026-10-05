import type { AssessmentCheck, AssessmentProcedure, AuditRun } from '@a11ied/contracts';
import { getTestMethod, listCriteriaByLevel } from '@a11ied/wcag-engine';
import { getAssessmentCheckId } from './run-store.js';

const LEVELS = ['A', 'AA', 'AAA'] as const;

/** Use the pinned catalog for every level included in the requested profile. */
export function getAssessmentCatalog(run: AuditRun): {
   procedures: AssessmentProcedure[];
   gapCriterionIds: string[];
} {
   const criteria = LEVELS.slice(0, LEVELS.indexOf(run.profile.level) + 1).flatMap(
      (level) => listCriteriaByLevel(level, run.profile.wcagVersion).criteria,
   );
   const strategies = criteria.map(
      (criterion) =>
         getTestMethod(criterion.id, { version: run.profile.wcagVersion }).strategy,
   );
   return {
      procedures: strategies
         .filter((strategy) => strategy.coverageGap === undefined)
         .flatMap((strategy) =>
            strategy.procedures.filter(
               (procedure) => procedure.procedureId !== 'axe_scan',
            ),
         ),
      gapCriterionIds: strategies
         .filter((strategy) => strategy.coverageGap !== undefined)
         .map((strategy) => strategy.criterionId),
   };
}

function buildObligation(input: {
   procedure: AssessmentProcedure;
   environmentId: string;
   stateIds: string[];
   journeyId?: string | undefined;
}): AssessmentCheck {
   const { procedure, environmentId, stateIds, journeyId } = input;
   const check = {
      criterionId: procedure.criterionId,
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      scope: procedure.scope,
      stateIds,
      ...(journeyId ? { journeyId } : {}),
      environmentId,
      status: 'queued' as const,
      attempts: 0,
      evidenceIds: [],
      updatedAt: new Date().toISOString(),
   };
   return { ...check, checkId: getAssessmentCheckId(check) };
}

function listProcedureObligations(
   run: AuditRun,
   procedure: AssessmentProcedure,
): AssessmentCheck[] {
   if (procedure.scope === 'state') {
      return run.states.map((state) =>
         buildObligation({
            procedure,
            environmentId: state.environmentId,
            stateIds: [state.stateId],
         }),
      );
   }
   if (procedure.scope === 'site') {
      return run.environments.map((environment) =>
         buildObligation({
            procedure,
            environmentId: environment.environmentId,
            stateIds: [],
         }),
      );
   }
   if (procedure.scope === 'journey') {
      return run.journeys.flatMap((journey) => {
         const first = run.states.find((state) => state.stateId === journey.stateIds[0]);
         const sameEnvironment =
            first &&
            journey.stateIds.every((id) =>
               run.states.some(
                  (state) =>
                     state.stateId === id && state.environmentId === first.environmentId,
               ),
            );
         return sameEnvironment
            ? [
                 buildObligation({
                    procedure,
                    environmentId: first.environmentId,
                    stateIds: journey.stateIds,
                    journeyId: journey.journeyId,
                 }),
              ]
            : [];
      });
   }
   return [];
}

/** Derive required identities independently of saved progress or inventory flags. */
export function listAssessmentObligations(run: AuditRun): AssessmentCheck[] {
   return getAssessmentCatalog(run).procedures.flatMap((procedure) =>
      listProcedureObligations(run, procedure),
   );
}

/** Reconcile discovered work without replacing attempts, evidence, or stale results. */
export function queueAssessmentObligations(run: AuditRun): void {
   const existing = new Set(run.checks.map((check) => check.checkId));
   run.checks.push(
      ...listAssessmentObligations(run).filter((check) => !existing.has(check.checkId)),
   );
}
