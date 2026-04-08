import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   levelVerificationResultSchema,
   verificationCriterionResultSchema,
   verificationExecutionPlanSchema,
   verificationEvidenceRecordSchema,
   verificationReportSchema,
   verificationRequestedScopeSchema,
} from './index.js';

const fixtureRoot = resolve(import.meta.dirname, '../test-fixtures');

async function loadFixtureJson<TData>(fileName: string): Promise<TData> {
   return JSON.parse(await readFile(resolve(fixtureRoot, fileName), 'utf8')) as TData;
}

const EXPECTED_FAILED_COUNT = 3;

type CriterionResult = ReturnType<typeof verificationCriterionResultSchema.parse>;

function assertReportRoundTrips(
   passFixture: ReturnType<typeof verificationReportSchema.parse>,
   mixedFixture: ReturnType<typeof verificationReportSchema.parse>,
): void {
   expect(structuredClone(passFixture)).toEqual(passFixture);
   expect(structuredClone(mixedFixture)).toEqual(mixedFixture);
   expect(passFixture.requestedScope.kind).toBe('criterion');
   expect(mixedFixture.requestedScope.kind).toBe('level');
}

function assertHybridCriterion(criterion: CriterionResult): void {
   expect(criterion.verdict).toBe('pass');
   expect(criterion.evidenceMode).toBe('hybrid');
   expect(criterion.procedureIds).toContain('status_message_probe');
   expect(
      criterion.evidence[0]?.patternResult?.spokenPhraseLog.includes(
         'Profile saved successfully.',
      ),
   ).toBe(true);
}

function assertAutomatedCriterion(criterion: CriterionResult): void {
   expect(criterion.verdict).toBe('fail');
   expect(criterion.evidenceMode).toBe('automated');
   expect(criterion.evidence[0]?.axeResult?.violations[0]?.id).toBe('button-name');
}

function assertManualCriterion(criterion: CriterionResult): void {
   expect(criterion.verdict).toBe('needs-manual-review');
   expect(criterion.evidenceMode).toBe('manual');
   expect(criterion.uncoveredWork.some((entry) => entry.kind === 'manual-only')).toBe(
      true,
   );
}

function assertUncoveredCriterion(criterion: CriterionResult): void {
   expect(criterion.verdict).toBe('not-covered');
   expect(criterion.evidenceMode).toBe('unknown');
   expect(criterion.uncoveredWork.some((entry) => entry.kind === 'not-covered')).toBe(
      true,
   );
}

function assertMixedReportStructure(
   mixedFixture: ReturnType<typeof verificationReportSchema.parse>,
): void {
   const requestedScope = verificationRequestedScopeSchema.parse(
      mixedFixture.requestedScope,
   );
   const firstExecutionPlan = verificationExecutionPlanSchema.parse(
      mixedFixture.criteria[0]?.executionPlan,
   );
   const firstEvidence = verificationEvidenceRecordSchema.parse(
      mixedFixture.criteria[0]?.evidence[0],
   );
   const levelResult = levelVerificationResultSchema.parse({
      level: 'AA',
      wcagVersion: mixedFixture.wcagVersion,
      summary: mixedFixture.summary,
      criteria: mixedFixture.criteria,
      uncoveredCriterionIds: ['3.3.8', '2.4.3'],
      manualOnlyCriterionIds: ['3.3.8'],
   });

   expect(requestedScope.kind).toBe('level');
   expect(firstExecutionPlan.strategyId).toBe('wcag-2.2:4.1.2');
   expect(firstEvidence.kind).toBe('axe');
   expect(mixedFixture.summary.failedCount).toBe(EXPECTED_FAILED_COUNT);
   expect(levelResult.summary.manualOnlyCount).toBe(1);
   expect(levelResult.uncoveredCriterionIds).toEqual(['3.3.8', '2.4.3']);
}

describe('contracts verification payloads - round-trip', () => {
   it('round-trips the passing and mixed verification report fixtures', async () => {
      const passFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.pass.json'),
      );
      const mixedFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.mixed.json'),
      );
      assertReportRoundTrips(passFixture, mixedFixture);
   });
});

describe('contracts verification payloads - criterion row shapes', () => {
   it('locks the criterion verification row shape for all outcome types', async () => {
      const passFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.pass.json'),
      );
      const mixedFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.mixed.json'),
      );

      const hybridCriterion = verificationCriterionResultSchema.parse(
         passFixture.criteria[0],
      );
      const automatedCriterion = verificationCriterionResultSchema.parse(
         mixedFixture.criteria.find((cr) => cr.criterionId === '4.1.2'),
      );
      const manualCriterion = verificationCriterionResultSchema.parse(
         mixedFixture.criteria.find((cr) => cr.criterionId === '3.3.8'),
      );
      const uncoveredCriterion = verificationCriterionResultSchema.parse(
         mixedFixture.criteria.find((cr) => cr.criterionId === '2.4.3'),
      );

      assertHybridCriterion(hybridCriterion);
      assertAutomatedCriterion(automatedCriterion);
      assertManualCriterion(manualCriterion);
      assertUncoveredCriterion(uncoveredCriterion);
   });
});

describe('contracts verification payloads - report structure', () => {
   it('locks the top-level verification report and level result structure', async () => {
      const mixedFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.mixed.json'),
      );
      assertMixedReportStructure(mixedFixture);
   });
});
