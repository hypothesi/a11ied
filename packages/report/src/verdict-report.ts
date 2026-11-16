import type {
   CriterionId,
   EvidenceRecord,
   EvidenceOutcome,
   MeasurementRecord,
   PageVerdict,
   ScopeExclusionRule,
   TemplateGroupMetadata,
   Verdict,
   VerdictImpact,
   StateSetupAction,
} from '@a11ied/contracts';
import { createHash } from 'node:crypto';

import {
   computePageVerdicts,
   getCriterionImpact,
   IMPACT_RANK,
   readVerdicts,
   isAcceptedVerdict,
   listReviewObligations,
   listLatestVerdicts,
   matchScopeExclusion,
   unresolvedProposal,
   WCAG_22_AA_CRITERIA,
} from '@a11ied/verdict';

export { readVerdicts };

export type VpatConformanceLevel =
   | 'Supports'
   | 'Partially Supports'
   | 'Does Not Support'
   | 'Not Applicable'
   | 'Not Evaluated';

export interface VpatCriterionRow {
   criterionId: CriterionId;
   level: 'A' | 'AA';
   conformance: VpatConformanceLevel;
   remarks: string;
   failingStates: string[];
   passedStates: string[];
   needsReviewStates: string[];
   excludedStates: string[];
   inapplicableStates: string[];
}

export interface RemediationRoadmapItem {
   criterionId: CriterionId;
   impact: VerdictImpact;
   templateGroupId: string;
   affectedStateIds: string[];
   rationale: string;
   repro: string[];
   measurementsSummary?: string | undefined;
}

export interface MethodologyDisclosure {
   tierCounts: { tier0: number; tier1: number; tier2: number; tier3: number };
   assistiveTechnology: {
      virtualDomCount: number;
      nativeSrCount: number;
      statement: string;
   };
   templateGroups: {
      templateGroupId: string;
      representativeStateId: string;
      memberStateIds: string[];
   }[];
   scopeExclusions: ScopeExclusionRule[];
}

export interface ScopedAssessmentResult {
   checkId: string;
   criterionId: string;
   procedureId: string;
   scope: 'site' | 'journey';
   environmentId?: string;
   journeyId?: string;
   stateIds: readonly string[];
   outcome: EvidenceOutcome | 'unassessed';
   complete: boolean;
   reasons: readonly string[];
   evidenceIds: readonly string[];
}

export interface CoordinatedReportEvidence {
   runId: string;
   roots: readonly { stateId: string; fingerprint: string; digest: string }[];
   obligations: readonly ScopedAssessmentResult[];
   records: readonly EvidenceRecord[];
   coverageStatement: string;
}

export interface VerdictAuditReport {
   coordinator?: CoordinatedReportEvidence;
   generatedAt: string;
   targetOrigin: string;
   isDraft: boolean;
   snapshot: {
      digest: string;
      expectedChecks: number;
      completeChecks: number;
      unresolvedChecks: number;
      excludedChecks: number;
      scopeGaps: readonly string[];
      assessments: readonly Verdict[];
      states: readonly {
         stateId: string;
         targetUrl: string;
         fingerprint?: string | undefined;
         setupDigest: string;
      }[];
   };
   executiveSummary: {
      scopeStatement: string;
      overallConformance:
         | 'Supports'
         | 'Partially Supports'
         | 'Does Not Support'
         | 'Draft / Incomplete';
      totalStates: number;
      evaluatedCriteriaCount: number;
      failingCriteriaCount: number;
      needsReviewCriteriaCount: number;
      criticalFindingsCount: number;
      seriousFindingsCount: number;
      moderateFindingsCount: number;
      minorFindingsCount: number;
      headline: string;
   };
   pageVerdicts: PageVerdict[];
   remediationRoadmap: RemediationRoadmapItem[];
   vpatTable: VpatCriterionRow[];
   methodologyDisclosure: MethodologyDisclosure;
}

export const DEFAULT_WCAG_22_AA_CRITERIA: readonly CriterionId[] = WCAG_22_AA_CRITERIA;

const LEVEL_A_RAW =
   '1.1.1,1.2.1,1.2.2,1.2.3,1.3.1,1.3.2,1.3.3,1.4.1,1.4.2,' +
   '2.1.1,2.1.2,2.1.4,2.2.1,2.2.2,2.3.1,2.4.1,2.4.2,2.4.3,2.4.4,2.5.1,2.5.2,2.5.3,2.5.4,' +
   '3.1.1,3.2.1,3.2.2,3.2.6,3.3.1,3.3.2,3.3.7,4.1.2';

const LEVEL_A_CRITERIA = new Set<string>(LEVEL_A_RAW.split(','));

const TIER_TWO = 2;
const TIER_THREE = 3;

export function getCriterionLevel(criterionId: string): 'A' | 'AA' {
   return LEVEL_A_CRITERIA.has(criterionId) ? 'A' : 'AA';
}

function getUnitSuffix(unit?: string): string {
   if (unit === 'percent') {
      return '%';
   }
   if (unit) {
      return ` ${unit}`;
   }
   return '';
}

function formatMeasurement(record: MeasurementRecord): string {
   const hasThreshold = record.threshold !== undefined;
   const thresholdStr = hasThreshold ? String(record.threshold) : '';
   const unitSuffix = getUnitSuffix(record.unit);
   const valWithUnit = `${record.value}${unitSuffix}`;

   if (hasThreshold) {
      return `${record.metric}: ${valWithUnit} (threshold ${thresholdStr}${unitSuffix})`;
   }
   return `${record.metric}: ${valWithUnit}`;
}

export interface StateInput {
   fingerprint?: string | undefined;
   setup?: readonly StateSetupAction[] | undefined;
   stateId: string;
   targetUrl: string;
   templateGroup?: TemplateGroupMetadata | undefined;
   excluded?: boolean | undefined;
   exclusionReason?: string | undefined;
}

export interface BuildVerdictAuditReportInput {
   targetOrigin: string;
   states: readonly StateInput[];
   verdicts: readonly Verdict[];
   criterionIds?: readonly CriterionId[] | undefined;
   exclusions?: readonly ScopeExclusionRule[] | undefined;
   generatedAt?: string | undefined;
   forceDraft?: boolean | undefined;
   scopeGaps?: readonly string[] | undefined;
}

interface StateBucketResult {
   failingStates: string[];
   passedStates: string[];
   needsReviewStates: string[];
   excludedStates: string[];
   inapplicableStates: string[];
}

function bucketStatesForCriterion(
   criterionVerdicts: readonly Verdict[],
   states: readonly StateInput[],
   criterionId: CriterionId,
): StateBucketResult {
   const obligations = listReviewObligations({
      states,
      criterionIds: [criterionId],
      verdicts: criterionVerdicts,
   });
   return {
      failingStates: obligations
         .filter((check) => check.outcome === 'failed')
         .map((check) => check.stateId),
      passedStates: obligations
         .filter((check) => check.complete && check.outcome === 'passed')
         .map((check) => check.stateId),
      needsReviewStates: obligations
         .filter((check) => !check.complete)
         .map((check) => check.stateId),
      excludedStates: obligations
         .filter((check) => check.outcome === 'excluded')
         .map((check) => check.stateId),
      inapplicableStates: obligations
         .filter((check) => check.complete && check.outcome === 'inapplicable')
         .map((check) => check.stateId),
   };
}

function evaluateCriterionRow(
   criterionId: CriterionId,
   criterionVerdicts: readonly Verdict[],
   buckets: StateBucketResult,
): { conformance: VpatConformanceLevel; remarks: string } {
   const { failingStates, passedStates, needsReviewStates } = buckets;

   if (failingStates.length > 0) {
      if (passedStates.length > 0) {
         return {
            conformance: 'Partially Supports',
            remarks: `Partially supports: passed on ${passedStates.length} states, failed on ${failingStates.length} states (${failingStates.join(', ')}).`,
         };
      }
      return {
         conformance: 'Does Not Support',
         remarks: `Does not support: failed on ${failingStates.length} states (${failingStates.join(', ')}).`,
      };
   }

   if (criterionVerdicts.length === 0) {
      return {
         conformance: 'Not Evaluated',
         remarks: 'Not evaluated: no verdicts recorded for this criterion.',
      };
   }

   if (needsReviewStates.length > 0) {
      return {
         conformance: 'Not Evaluated',
         remarks: `Not evaluated: review required on ${needsReviewStates.length} states (${needsReviewStates.join(', ')}).`,
      };
   }

   if (passedStates.length === 0 && buckets.inapplicableStates.length === 0) {
      return {
         conformance: 'Not Evaluated',
         remarks: 'Excluded from scope; no in-scope states assessed.',
      };
   }
   const allInapplicable =
      buckets.inapplicableStates.length > 0 && passedStates.length === 0;

   if (allInapplicable) {
      return {
         conformance: 'Not Applicable',
         remarks: 'Not applicable: no matching content found.',
      };
   }

   return {
      conformance: 'Supports',
      remarks: `Supports: verified across ${passedStates.length} evaluated states.`,
   };
}

function buildVpatTable(
   criterionIds: readonly CriterionId[],
   verdicts: readonly Verdict[],
   states: readonly StateInput[],
): VpatCriterionRow[] {
   return criterionIds.map((criterionId) => {
      const criterionVerdicts = verdicts.filter(
         (verdict) => verdict.criterionId === criterionId,
      );
      const buckets = bucketStatesForCriterion(criterionVerdicts, states, criterionId);
      const evaluation = evaluateCriterionRow(criterionId, criterionVerdicts, buckets);

      return {
         criterionId,
         level: getCriterionLevel(criterionId),
         conformance: evaluation.conformance,
         remarks: evaluation.remarks,
         failingStates: buckets.failingStates,
         passedStates: buckets.passedStates,
         needsReviewStates: buckets.needsReviewStates,
         excludedStates: buckets.excludedStates,
         inapplicableStates: buckets.inapplicableStates,
      };
   });
}

interface FailedGroup {
   criterionId: CriterionId;
   templateGroupId: string;
   verdicts: Verdict[];
}

function groupFailedVerdicts(
   states: readonly StateInput[],
   verdicts: readonly Verdict[],
): Map<string, FailedGroup> {
   const stateGroupMap = new Map<string, string>();
   for (const state of states) {
      if (state.templateGroup?.templateGroupId) {
         stateGroupMap.set(state.stateId, state.templateGroup.templateGroupId);
      }
   }

   const failedVerdicts = verdicts.filter((verdict) => verdict.outcome === 'failed');
   const groupMap = new Map<string, FailedGroup>();

   for (const verdict of failedVerdicts) {
      const templateGroupId = stateGroupMap.get(verdict.stateId) ?? verdict.stateId;
      const key = `${verdict.criterionId}::${templateGroupId}`;
      let entry = groupMap.get(key);
      if (!entry) {
         entry = {
            criterionId: verdict.criterionId,
            templateGroupId,
            verdicts: [],
         };
         groupMap.set(key, entry);
      }
      entry.verdicts.push(verdict);
   }

   return groupMap;
}

function createRoadmapItem(group: FailedGroup): RemediationRoadmapItem {
   let highestImpact: VerdictImpact = 'minor';
   for (const verdict of group.verdicts) {
      const currentImpact = getCriterionImpact(verdict.criterionId, verdict.impact);
      if (IMPACT_RANK[currentImpact] < IMPACT_RANK[highestImpact]) {
         highestImpact = currentImpact;
      }
   }

   const affectedStateIds = [
      ...new Set(group.verdicts.map((verdict) => verdict.stateId)),
   ].toSorted();
   const rationale =
      group.verdicts.find((verdict) => verdict.rationale.trim().length > 0)?.rationale ??
      group.verdicts[0]?.rationale ??
      'Accessibility failure detected.';
   const repro = [...new Set(group.verdicts.flatMap((verdict) => verdict.repro))];
   const allMeasurements = group.verdicts.flatMap(
      (verdict) => verdict.measurements ?? [],
   );
   const measurementsSummary =
      allMeasurements.length > 0
         ? [...new Set(allMeasurements.map((record) => formatMeasurement(record)))].join(
              '; ',
           )
         : undefined;

   return {
      criterionId: group.criterionId,
      impact: highestImpact,
      templateGroupId: group.templateGroupId,
      affectedStateIds,
      rationale,
      repro,
      measurementsSummary,
   };
}

function buildRemediationRoadmap(
   states: readonly StateInput[],
   verdicts: readonly Verdict[],
): RemediationRoadmapItem[] {
   const groupMap = groupFailedVerdicts(states, verdicts);
   const items: RemediationRoadmapItem[] = [];

   for (const group of groupMap.values()) {
      items.push(createRoadmapItem(group));
   }

   return items.toSorted((left, right) => {
      const impactDiff = IMPACT_RANK[left.impact] - IMPACT_RANK[right.impact];
      if (impactDiff !== 0) {
         return impactDiff;
      }
      const critDiff = left.criterionId.localeCompare(right.criterionId, undefined, {
         numeric: true,
      });
      if (critDiff !== 0) {
         return critDiff;
      }
      return left.templateGroupId.localeCompare(right.templateGroupId);
   });
}

function countTiersAndAtMethods(verdicts: readonly Verdict[]): {
   tierCounts: { tier0: number; tier1: number; tier2: number; tier3: number };
   virtualDomCount: number;
   nativeSrCount: number;
} {
   let tier0 = 0;
   let tier1 = 0;
   let tier2 = 0;
   let tier3 = 0;
   let virtualDomCount = 0;
   let nativeSrCount = 0;

   for (const verdict of verdicts) {
      if (!isAcceptedVerdict(verdict) || verdict.outcome === 'excluded') {
         continue;
      }
      switch (verdict.tier) {
         case 0: {
            tier0 += 1;
            break;
         }
         case 1: {
            tier1 += 1;
            break;
         }
         case TIER_TWO: {
            tier2 += 1;
            break;
         }
         case TIER_THREE: {
            tier3 += 1;
            break;
         }
         default: {
            break;
         }
      }
      if (verdict.method === 'native-sr') {
         nativeSrCount += 1;
      } else if (
         verdict.method === 'virtual-sr' ||
         verdict.evidence.some((ref) => ref.path.endsWith('#transcript'))
      ) {
         virtualDomCount += 1;
      }
   }

   return { tierCounts: { tier0, tier1, tier2, tier3 }, virtualDomCount, nativeSrCount };
}

function extractTemplateGroups(states: readonly StateInput[]): {
   templateGroupId: string;
   representativeStateId: string;
   memberStateIds: string[];
}[] {
   const templateGroupMap = new Map<
      string,
      { representativeStateId: string; memberStateIds: Set<string> }
   >();

   for (const state of states) {
      if (!state.templateGroup) {
         continue;
      }
      const { templateGroupId, representativeStateId, memberRole } = state.templateGroup;
      let entry = templateGroupMap.get(templateGroupId);
      if (!entry) {
         entry = {
            representativeStateId,
            memberStateIds: new Set<string>(),
         };
         templateGroupMap.set(templateGroupId, entry);
      }
      if (memberRole === 'representative') {
         entry.representativeStateId = state.stateId;
      } else if (
         memberRole === 'member' ||
         state.stateId !== entry.representativeStateId
      ) {
         entry.memberStateIds.add(state.stateId);
      }
   }

   return [...templateGroupMap.entries()].map(([templateGroupId, data]) => ({
      templateGroupId,
      representativeStateId: data.representativeStateId,
      memberStateIds: [...data.memberStateIds].toSorted(),
   }));
}

function buildMethodologyDisclosure(
   states: readonly StateInput[],
   verdicts: readonly Verdict[],
   exclusions?: readonly ScopeExclusionRule[],
): MethodologyDisclosure {
   const stats = countTiersAndAtMethods(verdicts);
   const templateGroups = extractTemplateGroups(states);
   const statement =
      'Audit methodology strictly distinguishes synthetic Virtual Screen Reader (virtual-dom) traversal from real Native Assistive Technology (voiceover / nvda). Virtual-DOM traversal explores accessibility trees and computed ARIA semantics programmatically, whereas native screen reader verification evaluates actual platform accessibility APIs and synthesized audio output.';

   return {
      tierCounts: stats.tierCounts,
      assistiveTechnology: {
         virtualDomCount: stats.virtualDomCount,
         nativeSrCount: stats.nativeSrCount,
         statement,
      },
      templateGroups,
      scopeExclusions: [
         ...(exclusions ?? []),
         ...states
            .filter(
               (state) => state.excluded && !matchScopeExclusion(state, exclusions ?? []),
            )
            .map((state) => ({
               ruleId: `state-${state.stateId}`,
               stateIds: [state.stateId],
               reason:
                  state.exclusionReason ??
                  'No exclusion reason recorded; scope requires review.',
            })),
      ],
   };
}

interface ExecutiveSummaryCounts {
   criticalFindingsCount: number;
   seriousFindingsCount: number;
   moderateFindingsCount: number;
   minorFindingsCount: number;
}

function countFindingsByImpact(
   findings: readonly Pick<RemediationRoadmapItem, 'impact'>[],
): ExecutiveSummaryCounts {
   let critical = 0;
   let serious = 0;
   let moderate = 0;
   let minor = 0;

   for (const finding of findings) {
      const impact = finding.impact;
      if (impact === 'critical') {
         critical += 1;
      } else if (impact === 'serious') {
         serious += 1;
      } else if (impact === 'moderate') {
         moderate += 1;
      } else if (impact === 'minor') {
         minor += 1;
      }
   }

   return {
      criticalFindingsCount: critical,
      seriousFindingsCount: serious,
      moderateFindingsCount: moderate,
      minorFindingsCount: minor,
   };
}

export function determineOverallConformance(
   isDraft: boolean,
   failingCriteriaCount: number,
   vpatTable: readonly VpatCriterionRow[],
): 'Supports' | 'Partially Supports' | 'Does Not Support' | 'Draft / Incomplete' {
   if (isDraft) {
      return 'Draft / Incomplete';
   }
   if (failingCriteriaCount === 0) {
      return 'Supports';
   }
   if (vpatTable.some((row) => row.conformance === 'Supports')) {
      return 'Partially Supports';
   }
   return 'Does Not Support';
}

interface HeadlineParams {
   isDraft: boolean;
   overallConformance: string;
   evaluatedCount: number;
   totalCount: number;
   failingCount: number;
   criticalCount: number;
   seriousCount: number;
}

export function createHeadline(params: HeadlineParams): string {
   if (params.isDraft) {
      return `Draft Audit: ${params.evaluatedCount} of ${params.totalCount} criteria evaluated; ${params.failingCount} failing, ${params.criticalCount} critical findings.`;
   }
   if (params.overallConformance === 'Supports') {
      return `Completed scoped review: All ${params.evaluatedCount} evaluated WCAG 2.2 A/AA criteria support accessibility requirements within the stated scope.`;
   }
   return `${params.overallConformance}: ${params.failingCount} failing criteria with ${params.criticalCount} critical and ${params.seriousCount} serious findings.`;
}

function normalizeReportInput(
   input: BuildVerdictAuditReportInput,
): BuildVerdictAuditReportInput {
   const criterionIds = input.criterionIds ?? DEFAULT_WCAG_22_AA_CRITERIA;
   return {
      ...input,
      verdicts: listLatestVerdicts(input.verdicts)
         .filter(
            (verdict) =>
               criterionIds.includes(verdict.criterionId) &&
               input.states.some((state) => state.stateId === verdict.stateId),
         )
         .map((verdict) => {
            if (
               isAcceptedVerdict(verdict) ||
               verdict.outcome === 'needsReview' ||
               verdict.outcome === 'cantTell'
            ) {
               return verdict;
            }
            return unresolvedProposal(
               verdict,
               new Error('Evidence has not been admitted for this report snapshot.'),
            );
         }),
   };
}

function getScopeStatement(gaps: readonly string[]): string {
   return [
      'Results cover only the listed pages, states and criteria. Excluded content and unassessed processes are outside these results.',
      ...gaps.map((gap) => `Unresolved scope gap: ${gap}`),
   ].join(' ');
}

export function buildVerdictAuditReport(
   proposed: BuildVerdictAuditReportInput,
): VerdictAuditReport {
   const input = normalizeReportInput(proposed);
   const scopeGaps = input.scopeGaps ?? [];
   const generatedAt = input.generatedAt ?? new Date().toISOString();
   const criterionIds = input.criterionIds ?? DEFAULT_WCAG_22_AA_CRITERIA;
   const pageVerdicts = computePageVerdicts(input.states, input.verdicts, criterionIds);
   const obligations = listReviewObligations({ ...input, criterionIds });
   const vpatTable = buildVpatTable(criterionIds, input.verdicts, input.states);
   const remediationRoadmap = buildRemediationRoadmap(input.states, input.verdicts);
   const methodologyDisclosure = buildMethodologyDisclosure(
      input.states,
      input.verdicts,
      input.exclusions,
   );

   const isDraft =
      input.states.some(
         (state) =>
            state.excluded &&
            !state.exclusionReason &&
            !matchScopeExclusion(state, input.exclusions ?? []),
      ) ||
      input.forceDraft === true ||
      scopeGaps.length > 0 ||
      obligations.every((check) => check.outcome === 'excluded') ||
      obligations.some((check) => !check.complete);

   const totalStates = input.states.length;
   const evaluatedCriteriaCount = vpatTable.filter(
      (row) => row.conformance !== 'Not Evaluated',
   ).length;
   const failingCriteriaCount = vpatTable.filter(
      (row) =>
         row.conformance === 'Does Not Support' ||
         row.conformance === 'Partially Supports',
   ).length;
   const needsReviewCriteriaCount = vpatTable.filter(
      (row) => row.needsReviewStates.length > 0,
   ).length;

   const findingsCounts = countFindingsByImpact(remediationRoadmap);
   const overallConformance = determineOverallConformance(
      isDraft,
      failingCriteriaCount,
      vpatTable,
   );
   const headline = createHeadline({
      isDraft,
      overallConformance,
      evaluatedCount: evaluatedCriteriaCount,
      totalCount: vpatTable.length,
      failingCount: failingCriteriaCount,
      criticalCount: findingsCounts.criticalFindingsCount,
      seriousCount: findingsCounts.seriousFindingsCount,
   });

   return {
      generatedAt,
      targetOrigin: input.targetOrigin,
      isDraft,
      snapshot: {
         digest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
         assessments: input.verdicts,
         scopeGaps,
         states: input.states.map((state) => ({
            stateId: state.stateId,
            targetUrl: state.targetUrl,
            fingerprint: state.fingerprint,
            setupDigest: createHash('sha256')
               .update(JSON.stringify(state.setup ?? []))
               .digest('hex'),
         })),
         expectedChecks: obligations.length,
         completeChecks: obligations.filter(
            (check) => check.complete && check.outcome !== 'excluded',
         ).length,
         unresolvedChecks: obligations.filter((check) => !check.complete).length,
         excludedChecks: obligations.filter((check) => check.outcome === 'excluded')
            .length,
      },
      executiveSummary: {
         scopeStatement: getScopeStatement(scopeGaps),
         overallConformance,
         totalStates,
         evaluatedCriteriaCount,
         failingCriteriaCount,
         needsReviewCriteriaCount,
         criticalFindingsCount: findingsCounts.criticalFindingsCount,
         seriousFindingsCount: findingsCounts.seriousFindingsCount,
         moderateFindingsCount: findingsCounts.moderateFindingsCount,
         minorFindingsCount: findingsCounts.minorFindingsCount,
         headline,
      },
      pageVerdicts,
      remediationRoadmap,
      vpatTable,
      methodologyDisclosure,
   };
}
