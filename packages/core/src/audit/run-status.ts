import type {
   AssessmentCheck,
   AuditJourney,
   AuditRun,
   EvidenceRecord,
   SiteInventory,
} from '@a11ied/contracts';
import { getCheckEvidenceError, readRunEvidence } from './check-evidence.js';
import { getAssessmentCatalog, listAssessmentObligations } from './run-obligations.js';
import { getAssessmentCheckId, listStateEnvironmentIds } from './run-store.js';
import {
   getScopeIssues,
   isPageStateMatched,
   isPageDocumentMatched,
   readScopedInventory,
   type AssessmentIssue,
} from './run-scope.js';

export interface AuditAssessmentStatus {
   run: AuditRun;
   coverage: { total: number; attempted: number; assessed: number; unresolved: number };
   issues: AssessmentIssue[];
   complete: boolean;
   progress: {
      states: ScopeAssessmentProgress[];
      pages: ScopeAssessmentProgress[];
      journeys: ScopeAssessmentProgress[];
   };
}

export interface AuditAssessmentSnapshot {
   status: AuditAssessmentStatus;
   records: EvidenceRecord[];
   inventory?: SiteInventory;
}

interface ScopeAssessmentProgress {
   id: string;
   label: string;
   total: number;
   assessed: number;
   unresolved: number;
   complete: boolean;
}

function getCheckIssue(
   check: AssessmentCheck,
   records: EvidenceRecord[],
): AssessmentIssue | undefined {
   if (check.status !== 'evaluated' || check.outcome === 'cantTell') {
      return {
         code: `audit-check-${check.status === 'evaluated' ? 'uncertain' : check.status}`,
         message:
            check.reason ??
            `WCAG ${check.criterionId}: ${check.status === 'evaluated' ? 'the evidence is inconclusive' : check.status}.`,
         checkId: check.checkId,
      };
   }
   const error = getCheckEvidenceError({ check, records });
   return error
      ? {
           code: 'audit-check-evidence-invalid',
           message: error,
           checkId: check.checkId,
        }
      : undefined;
}

function getCatalogIssues(run: AuditRun): AssessmentIssue[] {
   const { gapCriterionIds, procedures } = getAssessmentCatalog(run);
   const issues: AssessmentIssue[] = gapCriterionIds.map((criterionId) => ({
      code: 'audit-procedure-missing',
      criterionId,
      message: `No complete procedure is defined for WCAG ${criterionId}.`,
   }));
   if (run.states.length === 0) {
      issues.push({
         code: 'audit-states-missing',
         message: 'No target states have been observed.',
      });
   }
   if (
      run.journeys.length === 0 &&
      procedures.some((procedure) => procedure.scope === 'journey')
   ) {
      issues.push({
         code: 'audit-journeys-missing',
         message: 'No journeys have been observed for the required process assessments.',
      });
   }
   return issues;
}

function getScopeProgress(input: {
   id: string;
   label: string;
   checks: AssessmentCheck[];
   assessedIds: Set<string>;
   missingObservation?: boolean;
}): ScopeAssessmentProgress {
   const assessed = input.checks.filter((check) =>
         input.assessedIds.has(check.checkId),
      ).length,
      total = input.checks.length;
   return {
      id: input.id,
      label: input.label,
      total,
      assessed,
      unresolved: total - assessed,
      complete: total > 0 && total === assessed && !input.missingObservation,
   };
}

function getJourneyChecks(
   run: AuditRun,
   checks: AssessmentCheck[],
   journey: AuditJourney,
): AssessmentCheck[] {
   const environments = listStateEnvironmentIds(run, journey.stateIds);
   return checks.filter(
      (check) =>
         check.journeyId === journey.journeyId ||
         (check.scope === 'site' && environments.has(check.environmentId)) ||
         (check.scope !== 'journey' &&
            check.stateIds.some((id) => journey.stateIds.includes(id))),
   );
}

function getPageProgress(input: {
   run: AuditRun;
   checks: AssessmentCheck[];
   assessedIds: Set<string>;
   page: SiteInventory['pages'][number];
   hasCatalogGaps: boolean;
}): ScopeAssessmentProgress {
   const { run, checks, assessedIds, page, hasCatalogGaps } = input;
   const states = run.states.filter((state) => isPageDocumentMatched(state.target, page));
   return getScopeProgress({
      id: page.pageId,
      label: page.url,
      assessedIds,
      checks: checks.filter(
         (check) =>
            check.scope === 'site' ||
            states.some((state) => check.stateIds.includes(state.stateId)),
      ),
      missingObservation:
         hasCatalogGaps ||
         run.environments.some(
            (environment) =>
               !states.some(
                  (state) =>
                     state.environmentId === environment.environmentId &&
                     isPageStateMatched(state.target, page),
               ),
         ),
   });
}

function buildScopeProgress(input: {
   run: AuditRun;
   checks: AssessmentCheck[];
   assessedIds: Set<string>;
   inventory?: SiteInventory;
}): AuditAssessmentStatus['progress'] {
   const { run, checks, assessedIds, inventory } = input;
   const hasCatalogGaps = getAssessmentCatalog(run).gapCriterionIds.length > 0;
   return {
      states: run.states.map((state) =>
         getScopeProgress({
            id: state.stateId,
            label: state.label,
            assessedIds,
            checks: checks.filter(
               (check) =>
                  check.environmentId === state.environmentId &&
                  (check.scope === 'site' || check.stateIds.includes(state.stateId)),
            ),
            missingObservation: hasCatalogGaps,
         }),
      ),
      journeys: run.journeys.map((journey) =>
         getScopeProgress({
            id: journey.journeyId,
            label: journey.label,
            assessedIds,
            checks: getJourneyChecks(run, checks, journey),
            missingObservation:
               hasCatalogGaps ||
               journey.status !== 'completed' ||
               listStateEnvironmentIds(run, journey.stateIds).size !== 1,
         }),
      ),
      pages: (inventory?.pages ?? []).map((page) =>
         getPageProgress({ run, checks, assessedIds, page, hasCatalogGaps }),
      ),
   };
}

function isObligationMatched(
   check: AssessmentCheck,
   obligation: AssessmentCheck,
): boolean {
   return (
      getAssessmentCheckId(check) === obligation.checkId &&
      JSON.stringify(check.stateIds) === JSON.stringify(obligation.stateIds)
   );
}

function getObligationIssues(
   run: AuditRun,
   obligations: AssessmentCheck[],
): AssessmentIssue[] {
   const checks = new Map(run.checks.map((check) => [check.checkId, check])),
      issues: AssessmentIssue[] = [];
   for (const obligation of obligations) {
      const check = checks.get(obligation.checkId);
      if (!check || !isObligationMatched(check, obligation)) {
         issues.push({
            code: 'audit-obligation-missing',
            checkId: obligation.checkId,
            message: `Required WCAG ${obligation.criterionId} scope is missing or outdated.`,
         });
      }
   }
   return issues;
}

function getAssessedCheckIds(
   run: AuditRun,
   records: EvidenceRecord[],
): { assessedIds: Set<string>; issues: AssessmentIssue[] } {
   const assessedIds = new Set<string>(),
      issues: AssessmentIssue[] = [];
   for (const check of run.checks) {
      const issue = getCheckIssue(check, records);
      if (issue) {
         issues.push(issue);
      } else if (getAssessmentCheckId(check) === check.checkId) {
         assessedIds.add(check.checkId);
      } else {
         issues.push({
            code: 'audit-check-identity-invalid',
            checkId: check.checkId,
            message: 'The saved check identity does not match its assessment scope.',
         });
      }
   }
   return { assessedIds, issues };
}

/** Recompute coverage from catalog identities and current persisted evidence. */
export async function buildAuditAssessmentSnapshot(input: {
   file: string;
   run: AuditRun;
}): Promise<AuditAssessmentSnapshot> {
   const { run } = input;
   const obligations = listAssessmentObligations(run),
      records = await readRunEvidence(input);
   const scoped = await readScopedInventory(input);
   const evaluated = getAssessedCheckIds(run, records);
   const issues = [
      ...getCatalogIssues(run),
      ...getScopeIssues(run, scoped.inventory),
      ...scoped.issues,
      ...getObligationIssues(run, obligations),
      ...evaluated.issues,
   ];
   const total = new Set([...obligations, ...run.checks].map((check) => check.checkId))
      .size;
   const status: AuditAssessmentStatus = {
      run,
      coverage: {
         total,
         attempted: run.checks.filter((check) => check.attempts > 0).length,
         assessed: evaluated.assessedIds.size,
         unresolved: total - evaluated.assessedIds.size,
      },
      issues,
      complete: issues.length === 0 && total > 0,
      progress: buildScopeProgress({
         run,
         assessedIds: evaluated.assessedIds,
         checks: [
            ...new Map(
               [...run.checks, ...obligations].map((check) => [check.checkId, check]),
            ).values(),
         ],
         ...(scoped.inventory ? { inventory: scoped.inventory } : {}),
      }),
   };
   return {
      status,
      records,
      ...(scoped.inventory ? { inventory: scoped.inventory } : {}),
   };
}

/** Status and report consumers use the same evidence and scope evaluation. */
export async function buildAuditAssessmentStatus(input: {
   file: string;
   run: AuditRun;
}): Promise<AuditAssessmentStatus> {
   const snapshot = await buildAuditAssessmentSnapshot(input);
   return snapshot.status;
}
