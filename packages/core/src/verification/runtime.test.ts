import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { verifyCriterion, verifyLevel } from './runtime.js';

const fixtureRoot = resolve(import.meta.dirname, '../../../cli/test/fixtures');
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const ONE_MINUTE_MS = 60_000;
const TWO_MINUTES_MS = 120_000;
const MIN_AA_CRITERIA = 24;

let baseUrl = '';
let server: ReturnType<typeof createServer> = undefined as unknown as ReturnType<
   typeof createServer
>;
const tempRoots: string[] = [];
const repoRoot = process.cwd();

async function createTempRoot(): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11lied-verify-'));
   tempRoots.push(root);
   return root;
}

beforeAll(async () => {
   server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const filePath = resolve(fixtureRoot, `.${requestUrl.pathname}`);

      try {
         const html = readFileSync(filePath, 'utf8');
         response.writeHead(HTTP_OK, { 'content-type': 'text/html; charset=utf-8' });
         response.end(html);
      } catch {
         response.writeHead(HTTP_NOT_FOUND, {
            'content-type': 'text/plain; charset=utf-8',
         });
         response.end('not found');
      }
   });

   await new Promise<void>((resolveServer) => {
      server.listen(0, '127.0.0.1', () => {
         const address = server.address();
         if (!address || typeof address === 'string') {
            throw new Error('expected an address object');
         }
         baseUrl = `http://127.0.0.1:${address.port}`;
         resolveServer();
      });
   });
});

afterAll(async () => {
   await new Promise<void>((resolveServer, rejectServer) => {
      server.close((error) => {
         if (error) {
            rejectServer(error);
            return;
         }
         resolveServer();
      });
   });
});

afterEach(async () => {
   process.chdir(repoRoot);
   await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
   tempRoots.length = 0;
});

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
         const tempRoot = await createTempRoot();
         process.chdir(tempRoot);

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
         const tempRoot = await createTempRoot();
         process.chdir(tempRoot);

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
         const tempRoot = await createTempRoot();
         process.chdir(tempRoot);

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
