import { describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_ASSERTION,
   MIN_AA_CRITERIA_COUNT,
   TEST_TIMEOUT_VERY_LONG,
   useTestServer,
} from './setup.js';

const tempRoots: string[] = [];
const testServer: TestServerHandle = useTestServer(tempRoots);

function assertLevelCriteria(json: Record<string, unknown>): void {
   const criteria = (
      json.result as {
         criteria: Array<{
            criterionId: string;
            uncoveredWork: Array<{ kind?: string }>;
         }>;
      }
   ).criteria;
   expect(criteria.length).toBeGreaterThan(MIN_AA_CRITERIA_COUNT);
   expect(criteria.some((entry) => entry.criterionId === '3.3.8')).toBe(true);
   expect(criteria.some((entry) => entry.criterionId === '4.1.2')).toBe(true);
   expect(
      criteria.some((entry) =>
         entry.uncoveredWork.some(
            (work) => work.kind === 'manual-only' || work.kind === 'requires-real-target',
         ),
      ),
   ).toBe(true);
}

async function assertVerifyLevel(baseUrl: string): Promise<void> {
   const result = await runCli([
      'verify',
      'level',
      'AA',
      '--url',
      `${baseUrl}/auth-login.html`,
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect((json.result as { wcagVersion: string }).wcagVersion).toBe('2.2');
   expect(
      (json.result as { requestedScope: { kind: string; level: string } }).requestedScope,
   ).toMatchObject({ kind: 'level', level: 'AA' });
   const summary = (
      json.result as { summary: { totalCriteria: number; failedCount: number } }
   ).summary;
   expect(summary.totalCriteria).toBeGreaterThan(MIN_AA_CRITERIA_COUNT);
   expect(summary.failedCount).toBeGreaterThan(0);
   assertLevelCriteria(json);
}

async function assertVerifyTextCriterion(baseUrl: string): Promise<void> {
   const output = await runCli([
      'verify',
      'criterion',
      '4.1.2',
      '--url',
      `${baseUrl}/button-name-failure.html`,
      '--target',
      'virtual',
   ]);
   expect(output.stdout).toMatchInlineSnapshot(`
      "Scope: criterion=4.1.2
      WCAG: 2.2
      4.1.2  Name, Role, Value
      Verdict: fail [automated]
      Procedures: axe_scan
      Evidence: applicability, axe
      Warnings: verification-verdict
      "
    `);
}

async function assertVerifyTextVerbose(baseUrl: string): Promise<void> {
   const verbose = await runCli([
      'verify',
      'criterion',
      '3.3.8',
      '--url',
      `${baseUrl}/auth-login.html`,
      '--target',
      'virtual',
      '--verbose',
   ]);
   expect(verbose.stdout).toContain('Uncovered work:');
   expect(verbose.stdout).toContain('Notes:');
}

async function assertVerifyTextLevel(baseUrl: string): Promise<void> {
   const level = await runCli([
      'verify',
      'level',
      'AA',
      '--url',
      `${baseUrl}/auth-login.html`,
      '--target',
      'virtual',
   ]);
   expect(level.stdout).toContain('Scope: level=AA');
   expect(level.stdout).toContain('Summary: total=');
   expect(level.stdout).toContain('Rows:');
   expect(level.stdout).toContain('3.3.8');
}

describe('cli verify criterion commands / level and text output', () => {
   it(
      'verifies full level AA',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyLevel(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'keeps text criterion output readable',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyTextCriterion(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'keeps verbose output readable',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyTextVerbose(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'keeps level output readable',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyTextLevel(testServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );
});
