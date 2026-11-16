import { IMPACT_RANK } from '@a11ied/verdict';
import { createHash } from 'node:crypto';
import type { CriterionId, EvidenceRecord, VerdictImpact } from '@a11ied/contracts';
import {
   createHeadline,
   determineOverallConformance,
   getCriterionLevel,
   type VerdictAuditReport,
   type VpatCriterionRow,
} from '@a11ied/report';
import { isVerifiedEvidence } from '@a11ied/core';
import type { CoordinatedReviewScope } from './coordinator-scope.js';
import {
   listBroaderReviewObligations,
   type BroaderReviewObligation,
} from './coordinated-progress.js';
import type { ReviewRunState } from './types.js';

function buildScopedCriterionRow(input: {
   criterionId: CriterionId;
   obligations: readonly BroaderReviewObligation[];
}): VpatCriterionRow {
   const { criterionId, obligations } = input;
   const failed = obligations.some((unit) => unit.outcome === 'failed');
   const passed = obligations.some((unit) => unit.complete && unit.outcome === 'passed');
   let conformance: VpatCriterionRow['conformance'] = 'Not Evaluated';
   if (failed) {
      conformance = passed ? 'Partially Supports' : 'Does Not Support';
   } else if (obligations.length > 0 && obligations.every((unit) => unit.complete)) {
      conformance = passed ? 'Supports' : 'Not Applicable';
   }
   return {
      criterionId,
      level: getCriterionLevel(criterionId),
      conformance,
      remarks: obligations
         .map(
            (unit) =>
               `${unit.scope} ${unit.journeyId ?? unit.environmentId ?? 'missing context'}: ${unit.outcome}; ${unit.complete ? 'complete' : 'unresolved'}`,
         )
         .join('. '),
      failingStates: [],
      passedStates: [],
      needsReviewStates: [],
      excludedStates: [],
      inapplicableStates: [],
   };
}

function composeMethodologyDisclosure(input: {
   base: VerdictAuditReport['methodologyDisclosure'];
   records: readonly EvidenceRecord[];
}): VerdictAuditReport['methodologyDisclosure'] {
   const disclosure = structuredClone(input.base);
   for (const record of input.records) {
      const source = record.provenance?.source;
      if (source === 'native' || source === 'real-reader') {
         disclosure.tierCounts.tier3 += 1;
         disclosure.assistiveTechnology.nativeSrCount += 1;
      } else {
         disclosure.tierCounts.tier2 += 1;
         if (source === 'virtual') {
            disclosure.assistiveTechnology.virtualDomCount += 1;
         }
      }
   }
   return disclosure;
}

function getScopedFindingImpact(
   unit: BroaderReviewObligation,
   records: readonly EvidenceRecord[],
): VerdictImpact {
   const impacts = records
      .filter((record) => unit.evidenceIds.includes(record.evidenceId ?? ''))
      .map((record) => record.finding?.impact ?? 'moderate');
   return (
      impacts.toSorted((left, right) => IMPACT_RANK[left] - IMPACT_RANK[right])[0] ??
      'moderate'
   );
}

/** Only this orchestration layer combines current core-verified scope with state results. */
export function composeCoordinatedReviewReport(input: {
   run: ReviewRunState;
   scope: CoordinatedReviewScope;
   stateReport: VerdictAuditReport;
   forceDraft: boolean;
}): VerdictAuditReport {
   const { run, scope, stateReport } = input;
   const obligations = listBroaderReviewObligations({ run, scope });
   const records = scope.snapshot.records.filter(
      (record) =>
         isVerifiedEvidence(record) &&
         obligations.some((unit) => unit.evidenceIds.includes(record.evidenceId ?? '')),
   );
   const coordinator = {
      runId: scope.snapshot.status.run.runId,
      roots: scope.roots,
      obligations,
      records,
      coverageStatement:
         'State procedures count per state; site procedures count per environment; journey procedures count per ordered journey. This changes the legacy state-by-criterion denominator without performing additional assessments.',
   };
   const vpatTable = run.criterionIds.map((criterionId) => {
      const stateRow = stateReport.vpatTable.find(
         (row) => row.criterionId === criterionId,
      );
      return (
         stateRow ??
         buildScopedCriterionRow({
            criterionId,
            obligations: obligations.filter((unit) => unit.criterionId === criterionId),
         })
      );
   });
   const snapshot = {
      ...stateReport.snapshot,
      digest: createHash('sha256')
         .update(JSON.stringify({ state: stateReport.snapshot, coordinator }))
         .digest('hex'),
      expectedChecks: stateReport.snapshot.expectedChecks + obligations.length,
      completeChecks:
         stateReport.snapshot.completeChecks +
         obligations.filter((unit) => unit.complete).length,
      unresolvedChecks:
         stateReport.snapshot.unresolvedChecks +
         obligations.filter((unit) => !unit.complete).length,
   };
   const isDraft =
      input.forceDraft ||
      snapshot.scopeGaps.length > 0 ||
      snapshot.unresolvedChecks > 0 ||
      snapshot.completeChecks === 0;
   const failingCriteriaCount = vpatTable.filter(
      (row) =>
         row.conformance === 'Does Not Support' ||
         row.conformance === 'Partially Supports',
   ).length;
   const evaluatedCriteriaCount = vpatTable.filter(
      (row) => row.conformance !== 'Not Evaluated',
   ).length;
   const needsReviewCriteriaCount = run.criterionIds.filter(
      (criterionId) =>
         stateReport.vpatTable.some(
            (row) => row.criterionId === criterionId && row.needsReviewStates.length > 0,
         ) ||
         obligations.some((unit) => unit.criterionId === criterionId && !unit.complete),
   ).length;
   const overallConformance = determineOverallConformance(
      isDraft,
      failingCriteriaCount,
      vpatTable,
   );
   const executiveSummary = {
      ...stateReport.executiveSummary,
      evaluatedCriteriaCount,
      failingCriteriaCount,
      needsReviewCriteriaCount,
      overallConformance,
   };
   for (const unit of obligations.filter((entry) => entry.outcome === 'failed')) {
      switch (getScopedFindingImpact(unit, records)) {
         case 'critical': {
            executiveSummary.criticalFindingsCount += 1;
            break;
         }
         case 'serious': {
            executiveSummary.seriousFindingsCount += 1;
            break;
         }
         case 'minor': {
            executiveSummary.minorFindingsCount += 1;
            break;
         }
         default: {
            executiveSummary.moderateFindingsCount += 1;
            break;
         }
      }
   }
   executiveSummary.headline = createHeadline({
      isDraft,
      overallConformance,
      evaluatedCount: evaluatedCriteriaCount,
      totalCount: vpatTable.length,
      failingCount: failingCriteriaCount,
      criticalCount: executiveSummary.criticalFindingsCount,
      seriousCount: executiveSummary.seriousFindingsCount,
   });
   return {
      ...stateReport,
      coordinator,
      snapshot,
      isDraft,
      vpatTable,
      executiveSummary,
      methodologyDisclosure: composeMethodologyDisclosure({
         base: stateReport.methodologyDisclosure,
         records,
      }),
   };
}
