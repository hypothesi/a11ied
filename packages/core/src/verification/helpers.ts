import {
   cliMessageSchema,
   verificationEvidenceRecordSchema,
   type CliMessage,
   type Platform,
   type VerificationCriterionResult,
   type VerificationEvidenceMode,
   type VerificationEvidenceRecord,
   type VerificationReport,
   type VerificationSourceReference,
   type VerificationUncoveredWorkItem,
} from '@a11lied/contracts';

export {
   createManualEvidence,
   createUncoveredWork,
   getErrorCause,
   handleAxeScanError,
   handleAxeScanStep,
   handleManualReviewStep,
   handlePatternError,
   handlePatternStep,
   handleUnrecognizedProcedure,
} from './procedure-handlers.js';

export { buildFinalResult, buildNotApplicableResult } from './result-builders.js';

export function createStrategyId(wcagVersion: string, criterionId: string): string {
   return `wcag-${wcagVersion}:${criterionId}`;
}

export function createBaseSourceReferences(
   criterionId: string,
   criterionTitle: string,
   wcagVersion: string,
): VerificationSourceReference[] {
   return [
      {
         kind: 'criterion',
         id: criterionId,
         label: criterionTitle,
      },
      {
         kind: 'coverage-artifact',
         id: `coverage.${wcagVersion}#${criterionId}`,
         label: 'Coverage artifact',
      },
      {
         kind: 'strategy-artifact',
         id: `strategy.${wcagVersion}#${criterionId}`,
         label: 'Verification strategy artifact',
      },
   ];
}

export function createApplicabilityEvidence(args: {
   criterionId: string;
   criterionTitle: string;
   evidenceMode: VerificationEvidenceMode;
   assessment: VerificationCriterionResult['applicability'];
   sourceReferences: VerificationSourceReference[];
}): VerificationEvidenceRecord {
   return verificationEvidenceRecordSchema.parse({
      id: `applicability:${args.criterionId}`,
      kind: 'applicability',
      mode: args.evidenceMode,
      collectedAt: new Date().toISOString(),
      summary:
         args.assessment.reasons[0] ??
         'Applicability signals were collected for this criterion.',
      sourceReferences: args.sourceReferences,
      applicability: args.assessment,
      notes: args.assessment.reasons.slice(1),
   });
}

function isNonPassingVerdict(verdict: VerificationCriterionResult['verdict']): boolean {
   return (
      verdict === 'fail' ||
      verdict === 'needs-manual-review' ||
      verdict === 'not-covered' ||
      verdict === 'error'
   );
}

export function createSummary(
   criteria: VerificationCriterionResult[],
): VerificationReport['summary'] {
   const summary: VerificationReport['summary'] = {
      totalCriteria: criteria.length,
      verdicts: {
         pass: 0,
         fail: 0,
         'needs-manual-review': 0,
         'not-applicable': 0,
         'not-covered': 0,
         error: 0,
      },
      evidenceModes: {
         automated: 0,
         hybrid: 0,
         manual: 0,
         unknown: 0,
      },
      uncoveredCount: 0,
      manualOnlyCount: 0,
      failedCount: 0,
   };

   for (const criterion of criteria) {
      summary.verdicts[criterion.verdict] += 1;
      summary.evidenceModes[criterion.evidenceMode] += 1;
      summary.uncoveredCount += criterion.uncoveredWork.length;
      summary.manualOnlyCount += criterion.uncoveredWork.filter(
         (entry) => entry.kind === 'manual-only',
      ).length;
      if (isNonPassingVerdict(criterion.verdict)) {
         summary.failedCount += 1;
      }
   }

   return summary;
}

export function isApplicable(
   state: VerificationCriterionResult['applicability']['state'],
): boolean {
   return state === 'applicable' || state === 'likely-applicable' || state === 'unknown';
}

function hasAxeFailures(evidence: VerificationEvidenceRecord[]): boolean {
   return evidence.some((entry) => (entry.axeResult?.violations.length ?? 0) > 0);
}

function hasPatternFailures(evidence: VerificationEvidenceRecord[]): boolean {
   return evidence.some((entry) =>
      entry.patternResult?.assertions.some((assertion) => assertion.status === 'failed'),
   );
}

function hasManualOnlyWork(uncoveredWork: VerificationUncoveredWorkItem[]): boolean {
   return uncoveredWork.some((entry) => entry.kind === 'manual-only');
}

function hasNotCoveredWork(uncoveredWork: VerificationUncoveredWorkItem[]): boolean {
   return uncoveredWork.some((entry) =>
      ['not-covered', 'missing-pattern', 'missing-rule', 'unsupported-target'].includes(
         entry.kind,
      ),
   );
}

export function deriveVerdict(args: {
   evidence: VerificationEvidenceRecord[];
   uncoveredWork: VerificationUncoveredWorkItem[];
   strategy: VerificationCriterionResult['strategy'];
   errors: CliMessage[];
}): VerificationCriterionResult['verdict'] {
   if (args.errors.length > 0) {
      return 'error';
   }

   if (hasAxeFailures(args.evidence) || hasPatternFailures(args.evidence)) {
      return 'fail';
   }

   if (
      args.strategy.preferredEvidenceMode === 'manual' ||
      hasManualOnlyWork(args.uncoveredWork)
   ) {
      return 'needs-manual-review';
   }

   if (hasNotCoveredWork(args.uncoveredWork)) {
      return 'not-covered';
   }

   return 'pass';
}

export function createVerificationMessage(
   criterionId: string,
   verdict: VerificationCriterionResult['verdict'],
): CliMessage | undefined {
   if (verdict === 'pass' || verdict === 'not-applicable') {
      return undefined;
   }

   return cliMessageSchema.parse({
      code: 'verification-verdict',
      message: `Criterion ${criterionId} reported verdict "${verdict}".`,
      details: {
         criterionId,
         verdict,
      },
   });
}

export function createLevelVerificationMessage(
   level: string,
   summary: VerificationReport['summary'],
): CliMessage | undefined {
   if (summary.failedCount === 0) {
      return undefined;
   }

   return cliMessageSchema.parse({
      code: 'verification-level-summary',
      message: `Level ${level} reported ${summary.failedCount} non-passing criterion verdict(s).`,
      details: {
         level,
         failedCount: summary.failedCount,
         manualOnlyCount: summary.manualOnlyCount,
         uncoveredCount: summary.uncoveredCount,
      },
   });
}

export function buildTarget(
   url: string,
   parsedTarget: Platform,
): VerificationReport['target'] {
   return {
      kind: 'url' as const,
      value: url,
      platform: parsedTarget,
      resolvedUrl: new URL(url).toString(),
   };
}
