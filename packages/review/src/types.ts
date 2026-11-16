import type { ReviewExecutionState } from './execution.js';
import type { ReviewCoordinatorLink } from './coordinator-scope.js';
import type { BroaderReviewObligation } from './coordinated-progress.js';
import type {
   AuditAssessmentRequest,
   BlockerCode,
   ConditionCaptureRequest,
   AssessmentCapability,
   AssessmentEvidenceKind,
   ObservationBundleSliceName,
   CriterionId,
   EvaluationTier,
   InapplicabilityKind,
   MeasurementRecord,
   ObservationBundle,
   ObservationRef,
   PageVerdict,
   ProcedureActionTemplate,
   ProcedureAssessment,
   ProcedureDoneDefinition,
   ScopeExclusionRule,
   StateSetupAction,
   VerdictNextAction,
   TemplateGroupMetadata,
   Verdict,
   VerdictImpact,
   VerdictMethod,
   VerdictOutcome,
   VirtualSrSummary,
} from '@a11ied/contracts';
import type { Browser } from 'playwright';
import type { VerdictAuditReport } from '@a11ied/report';

export interface ReviewStateRecord {
   stateId: string;
   targetUrl: string;
   fingerprint?: string | undefined;
   templateGroup?: TemplateGroupMetadata | undefined;
   setup?: readonly StateSetupAction[] | undefined;
   excluded?: boolean | undefined;
   exclusionReason?: string | undefined;
}

export interface StateClaimLease {
   stateId: string;
   agentId: string;
   claimedCheckIds: string[];
   claimedAt: string;
   lastProgressAt?: string;
   expiresAt?: string | undefined;
}

export interface ReviewRunState {
   coordinator?: ReviewCoordinatorLink;
   runId: string;
   runDir: string;
   targetOrigin: string;
   scopeGaps?: readonly string[] | undefined;
   createdAt: string;
   updatedAt: string;
   criterionIds: readonly CriterionId[];
   exclusions: readonly ScopeExclusionRule[];
   states: ReviewStateRecord[];
   activeStateLeases: Record<string, StateClaimLease>;
}

export interface NeedsReviewItem {
   checkId: string;
   criterionId: CriterionId;
   stateId: string;
   kind: string;
   summary: string;
   elementKey?: string | undefined;
   selector?: string | undefined;
   html?: string | undefined;
   screenshotPath?: string | undefined;
}

export interface ReviewCheckItem {
   checkId: string;
   stateId: string;
   criterionId: CriterionId;
   title: string;
   impact: VerdictImpact;
   tier: EvaluationTier;
   procedureId: string;
   procedureTitle?: string | undefined;
   procedureVersion: string;
   actions: readonly string[];
   requiredCapabilities: readonly AssessmentCapability[];
   requiredEvidence: readonly AssessmentEvidenceKind[];
   toolCalls: readonly ProcedureActionTemplate[];
   done: ProcedureDoneDefinition;
   inapplicabilityKind?: InapplicabilityKind | undefined;
   allowedBlockerCodes?: readonly BlockerCode[] | undefined;
}

export interface StateReviewPacket {
   runId: string;
   stateId: string;
   targetUrl: string;
   lease: StateClaimLease;
   bundleSummary: {
      digest?: string | undefined;
      fingerprint: string;
      capturedAt: string;
      title?: string | undefined;
      interactiveElementCount: number;
      headingCount: number;
      landmarkCount: number;
   };
   virtualSrTranscript: VirtualSrSummary;
   needsReviewItems: readonly NeedsReviewItem[];
   checks: readonly ReviewCheckItem[];
}

export interface ReviewTargetStateInput {
   stateId: string;
   targetUrl: string;
   templateGroup?: TemplateGroupMetadata | undefined;
   setup?: readonly StateSetupAction[] | undefined;
   excluded?: boolean | undefined;
   exclusionReason?: string | undefined;
   bundle?: ObservationBundle | undefined;
}

export interface ReviewCoverageSummary {
   totalObligations: number;
   passed: number;
   failed: number;
   inapplicable: number;
   cantTell: number;
   needsReview: number;
   excluded: number;
   unresolved: number;
   percentComplete: number;
}

export interface ActionableReviewItem {
   checkId: string;
   stateId: string;
   criterionId: CriterionId;
   impact: VerdictImpact;
   kind: 'claimable' | 'blocked' | 'stale' | 'needs-review' | 'leased';
   reason?: string | undefined;
   nextAction?: string | undefined;
}

export interface StartReviewInput {
   scopeGaps?: readonly string[] | undefined;
   runDir: string;
   runId?: string | undefined;
   target?: string | { url: string; origin?: string | undefined } | undefined;
   targetOrigin?: string | undefined;
   states?: readonly ReviewTargetStateInput[] | undefined;
   criterionIds?: readonly CriterionId[] | undefined;
   exclusions?: readonly ScopeExclusionRule[] | undefined;
   concurrency?: number | undefined;
   browser?: Browser | undefined;
   observeTarget?:
      | ((
           target: {
              targetUrl: string;
              stateId: string;
              setup?: readonly StateSetupAction[] | undefined;
           },
           index: number,
        ) => Promise<ObservationBundle>)
      | undefined;
}

export interface StartReviewResult {
   runId: string;
   targetOrigin: string;
   statesCount: number;
   verdictsRecorded: number;
   openTier2Count: number;
   coverage: ReviewCoverageSummary;
   pageVerdicts: PageVerdict[];
   nextBatchPreview: readonly ReviewCheckItem[];
}

export interface NextReviewInput {
   runDir: string;
   runId?: string | undefined;
   stateId?: string | undefined;
   agentId?: string | undefined;
   count?: number | undefined;
}

export interface NextReviewResult {
   execution?: ReviewExecutionState;
   coordinatorNextAction?: {
      tool: 'audit_assessment';
      arguments: Extract<AuditAssessmentRequest, { action: 'next' | 'resume' }>;
   };
   done: boolean;
   reason:
      | 'claimed'
      | 'complete'
      | 'blocked'
      | 'leased'
      | 'no-claimable-work'
      | 'coordinator-work'
      | 'scope-required';
   packet: StateReviewPacket | null;
}

export interface JudgeVerdictInput {
   procedureId?: string | undefined;
   assessment?: ProcedureAssessment | undefined;
   criterionId: CriterionId;
   stateId: string;
   outcome: VerdictOutcome;
   confidence?: number | undefined;
   impact?: VerdictImpact | undefined;
   method?: VerdictMethod | undefined;
   rationale: string;
   evidence?: readonly ObservationRef[] | undefined;
   measurements?: readonly MeasurementRecord[] | undefined;
   repro?: readonly string[] | undefined;
   nextAction?: VerdictNextAction | undefined;
   blockerCode?: BlockerCode | undefined;
   exclusionReason?: string | undefined;
   tier?: EvaluationTier | undefined;
}

export interface JudgeReviewInput {
   runDir: string;
   runId?: string | undefined;
   agentId?: string | undefined;
   verdicts: readonly JudgeVerdictInput[];
}

export interface JudgeReviewResult {
   recordedCount: number;
   closedCount: number;
   remainingCount: number;
   verdicts: readonly Verdict[];
}

export type { ObservationBundleSliceName } from '@a11ied/contracts';

export interface ObserveReviewInput {
   capture?: ConditionCaptureRequest | undefined;
   runDir: string;
   stateId: string;
   setup?: readonly StateSetupAction[] | undefined;
   slice?: ObservationBundleSliceName | undefined;
   browser?: Browser | undefined;
   targetUrl?: string | undefined;
}

export interface ObserveReviewResult {
   fingerprint: string;
   digest: string;
   capturedAt: string;
   stateId: string;
   slice?: ObservationBundleSliceName | undefined;
   bundle?: ObservationBundle | undefined;
   data?: unknown;
}

export interface StatusReviewInput {
   runDir: string;
   runId?: string | undefined;
   full?: boolean | undefined;
   agentId?: string | undefined;
}

export interface StatusReviewResult {
   execution: ReviewExecutionState;
   broaderObligations?: readonly BroaderReviewObligation[];
   scopeGaps: readonly string[];
   runId: string;
   targetOrigin: string;
   coverage: ReviewCoverageSummary;
   activeLeases: readonly StateClaimLease[];
   actionable: readonly ActionableReviewItem[];
   pageVerdicts?: readonly PageVerdict[] | undefined;
   states?: readonly ReviewStateRecord[] | undefined;
   verdicts?: readonly Verdict[] | undefined;
}

export interface ReportReviewInput {
   runDir: string;
   runId?: string | undefined;
   outDir?: string | undefined;
   formats?: readonly ('html' | 'json' | 'markdown')[] | undefined;
   draft?: boolean | undefined;
}

export interface ReportReviewResult {
   report: VerdictAuditReport;
   paths: {
      jsonPath: string;
      htmlPath: string;
      markdownPath: string;
   };
}

export interface RunReviewInput extends StartReviewInput {
   nextCount?: number | undefined;
   draftReport?: boolean | undefined;
}

export interface RunReviewResult {
   runId: string;
   startResult: StartReviewResult;
   draftReport?: ReportReviewResult | undefined;
   firstPacket: StateReviewPacket | null;
}

export const REVIEW_OPERATIONS = [
   'review.start',
   'review.next',
   'review.observe',
   'review.judge',
   'review.status',
   'review.report',
   'review.run',
] as const;

export type ReviewOperation = (typeof REVIEW_OPERATIONS)[number];
