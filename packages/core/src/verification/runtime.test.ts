import { describe, expect, it } from 'vitest';

import { createTempRoot } from '../../../cli/src/testing/fixtures.js';
import { useManagedTestServer } from '../../../cli/src/testing/lifecycle.js';
import { verifyCriterion, verifyLevel } from './runtime.js';

const ONE_MINUTE_MS = 60_000;
const TWO_MINUTES_MS = 120_000;
const MIN_AA_CRITERIA = 24;

let baseUrl = '';
const tempRoots: string[] = [];
const managedServer = useManagedTestServer(tempRoots);

function expectAutomatedCriterionReport(report: {
   criteria: Array<{
      criterionId?: string;
      evidenceMode?: string;
      executionPlan: { selectedProcedureIds: string[] };
   }>;
}): void {
   expect(report.criteria[0]?.criterionId).toBe('1.3.1');
   expect(report.criteria[0]?.evidenceMode).toBe('automated');
   expect(report.criteria[0]?.executionPlan.selectedProcedureIds).toContain('axe_scan');
}

function expectHybridCriterionReport(report: {
   criteria: Array<{
      verdict?: string;
      evidenceMode?: string;
      evidence: Array<{ patternResult?: { spokenPhraseLog: string[] } | undefined }>;
   }>;
}): void {
   expect(report.criteria[0]?.verdict).toBe('pass');
   expect(report.criteria[0]?.evidenceMode).toBe('hybrid');
   expect(
      report.criteria[0]?.evidence.some((entry) =>
         entry.patternResult?.spokenPhraseLog.includes('Profile saved successfully.'),
      ),
   ).toBe(true);
}

function expectManualReviewCriterionReport(report: {
   criteria: Array<{
      verdict?: string;
      uncoveredWork: Array<{ kind: string }>;
   }>;
   summary: { failedCount: number };
}): void {
   expect(report.criteria[0]?.verdict).toBe('needs-manual-review');
   expect(
      report.criteria[0]?.uncoveredWork.some((entry) => entry.kind === 'manual-only'),
   ).toBe(true);
   expect(report.summary.failedCount).toBe(1);
}

function expectLevelReportScope(report: {
   requestedScope: unknown;
   summary: { totalCriteria: number; failedCount: number };
   criteria: unknown[];
}): void {
   expect(report.requestedScope).toMatchObject({
      kind: 'level',
      level: 'AA',
   });
   expect(report.summary.totalCriteria).toBeGreaterThan(MIN_AA_CRITERIA);
   expect(report.summary.failedCount).toBeGreaterThan(0);
   expect(report.criteria.length).toBe(report.summary.totalCriteria);
}

describe('criterion verification automated and hybrid reports', () => {
   it(
      'produces automated, hybrid, and manual-review criterion reports without hiding gaps',
      async () => {
         const tempRoot = await createTempRoot(tempRoots);
         process.chdir(tempRoot);
         baseUrl = managedServer.getBaseUrl();

         const automated = await verifyCriterion({
            criterion: '1.3.1',
            url: `${baseUrl}/basic-page.html`,
            target: 'virtual',
            wcagVersion: '2.2',
         });
         expectAutomatedCriterionReport(automated);

         const hybrid = await verifyCriterion({
            criterion: '4.1.3',
            url: `${baseUrl}/status-message.html`,
            target: 'virtual',
            wcagVersion: '2.2',
         });
         expectHybridCriterionReport(hybrid);

         const manual = await verifyCriterion({
            criterion: '3.3.8',
            url: `${baseUrl}/auth-login.html`,
            target: 'virtual',
            wcagVersion: '2.2',
         });
         expectManualReviewCriterionReport(manual);
      },
      ONE_MINUTE_MS,
   );
});

describe('criterion verification uncovered notes', () => {
   it(
      'records uncovered verification notes for representative hybrid criteria',
      async () => {
         const tempRoot = await createTempRoot(tempRoots);
         process.chdir(tempRoot);
         baseUrl = managedServer.getBaseUrl();

         const focusOrder = await verifyCriterion({
            criterion: '2.4.3',
            url: `${baseUrl}/auth-login.html`,
            target: 'virtual',
            wcagVersion: '2.2',
         });

         expect(focusOrder.criteria[0]?.criterionId).toBe('2.4.3');
         expect(focusOrder.criteria[0]?.evidenceMode).toBe('hybrid');
         expect(focusOrder.criteria[0]?.procedureIds).toContain('focus_order_probe');
         expect(
            focusOrder.criteria[0]?.notes.some((entry) =>
               entry.includes('real assistive technology target'),
            ),
         ).toBe(true);
      },
      ONE_MINUTE_MS,
   );
});

describe('level verification runtime', () => {
   it(
      'emits a cumulative criterion matrix without stopping on the first non-pass row',
      async () => {
         const tempRoot = await createTempRoot(tempRoots);
         process.chdir(tempRoot);
         baseUrl = managedServer.getBaseUrl();

         const report = await verifyLevel({
            level: 'AA',
            url: `${baseUrl}/auth-login.html`,
            target: 'virtual',
            wcagVersion: '2.2',
         });

         expectLevelReportScope(report);
         expect(report.criteria.some((row) => row.criterionId === '4.1.2')).toBe(true);
         expect(report.criteria.some((row) => row.criterionId === '3.3.8')).toBe(true);
         expect(report.criteria.some((row) => row.criterionId === '2.4.3')).toBe(true);
         expect(
            report.criteria.some(
               (row) =>
                  row.criterionId === '3.3.8' &&
                  row.uncoveredWork.some((entry) => entry.kind === 'manual-only'),
            ),
         ).toBe(true);
         expect(
            report.criteria.some((row) =>
               row.uncoveredWork.some(
                  (entry) =>
                     entry.kind === 'requires-real-target' ||
                     entry.kind === 'manual-only',
               ),
            ),
         ).toBe(true);
      },
      TWO_MINUTES_MS,
   );
});
