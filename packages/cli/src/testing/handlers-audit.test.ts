import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

interface AuditResult {
   axe: { violations: Array<{ id: string }> };
   tree: {
      pageTitle: string;
      firstHeading?: string;
      counts: { headings: number; links: number };
   };
   relevance: {
      matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
   };
   criteria: Array<{
      id: string;
      axeVerdict: string;
      relevance: string;
      testMethod: string;
   }>;
   verdict: { passed: boolean };
   nextCommands: string[];
}

async function assertAuditFailsOnViolations(baseUrl: string): Promise<void> {
   const result = await runCli([
      'audit',
      `${baseUrl}/button-name-failure.html`,
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect(json.ok).toBe(true);
   const audit = json.result as unknown as AuditResult;
   expect(audit.axe.violations.some((violation) => violation.id === 'button-name')).toBe(
      true,
   );
   expect(audit.verdict.passed).toBe(false);
   expect(audit.nextCommands).toContain('a1 wcag rule button-name');
}

async function assertAuditReportsTreeAndRelevance(baseUrl: string): Promise<void> {
   const result = await runCli(['audit', `${baseUrl}/status-message.html`, '--json']);
   const json = parseJsonOutput(result.stdout);
   const audit = json.result as unknown as AuditResult;

   expect(audit.tree.pageTitle).toBeTruthy();
   expect(audit.tree.counts.headings).toBeGreaterThan(0);
   expect(audit.relevance.matrix.assessments['4.1.3']?.state).toBe('relevant');

   const rollupEntry = audit.criteria.find((entry) => entry.id === '4.1.3');
   expect(rollupEntry?.relevance).toBe('relevant');
}

async function assertAuditFailOnRespected(baseUrl: string): Promise<void> {
   const withoutFailOn = await runCli([
      'audit',
      `${baseUrl}/contrast-failure.html`,
      '--json',
   ]);
   expect(withoutFailOn.status).toBe(EXIT_ASSERTION);

   const withFailOn = await runCli([
      'audit',
      `${baseUrl}/contrast-failure.html`,
      '--fail-on',
      'critical',
      '--json',
   ]);
   expect(withFailOn.status).toBe(EXIT_SUCCESS);
   const json = parseJsonOutput(withFailOn.stdout);
   expect((json.result as unknown as AuditResult).verdict.passed).toBe(true);
}

/** --verbose shows every criterion as a table, not as stored field names. */
async function assertAuditVerboseTable(baseUrl: string): Promise<void> {
   const verbose = await runCli([
      'audit',
      `${baseUrl}/button-name-failure.html`,
      '--verbose',
   ]);
   expect(verbose.stdout).toContain('Every criterion');
   expect(verbose.stdout).toMatch(
      /Criterion\s+Level\s+Outcome\s+Scanner checks\s+Applies here/,
   );
   expect(verbose.stdout).toContain('failed');
   expect(verbose.stdout).not.toContain('axe=fail');
   expect(verbose.stdout).not.toContain('testMethod=automated');
}

/**
 * The text report is what a person reads, so it states the finding and the command that
 * follows it. The raw per-criterion values belong to --json and --verbose.
 */
async function assertAuditTextStatesFindings(baseUrl: string): Promise<void> {
   const failing = await runCli(['audit', `${baseUrl}/button-name-failure.html`]);
   expect(failing.stdout).toContain('1 problem to fix');
   expect(failing.stdout).toContain('4.1.2  Name, Role, Value');
   expect(failing.stdout).toContain('Buttons must have discernible text');
   expect(failing.stdout).toContain('1 failing element');
   expect(failing.stdout).toContain('a1 wcag rule button-name');
   expect(failing.stdout).not.toContain('axe=fail');
   expect(failing.stdout).not.toContain('relevance=not-detected');
}

async function assertAuditTextWithoutFindings(baseUrl: string): Promise<void> {
   const passing = await runCli(['audit', `${baseUrl}/basic-page.html`]);

   expect(passing.stdout).toContain('Nothing failed the automated checks');
   expect(passing.stdout).not.toContain('Problems');
}

async function assertAuditInlineHtml(): Promise<void> {
   const result = await runCli(['audit', '--html', '<h1>Hi</h1>', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect((json.target as { kind: string }).kind).toBe('html');
   const audit = json.result as unknown as AuditResult;
   expect(audit.tree.firstHeading).toBe('Hi');
}

describe('cli audit command', () => {
   it(
      'exits 4 and lists next commands when axe finds violations',
      async () => {
         await assertAuditFailsOnViolations(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'reports a tree summary and the relevant criteria',
      async () => {
         await assertAuditReportsTreeAndRelevance(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it('scans inline --html', assertAuditInlineHtml, TEST_TIMEOUT_LONG);

   it(
      'states each finding and its fix command in the text report',
      async () => {
         await assertAuditTextStatesFindings(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'states when the text report has no findings',
      async () => {
         await assertAuditTextWithoutFindings(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'shows criterion details in the verbose text report',
      async () => {
         await assertAuditVerboseTable(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      '--fail-on carries through to the audit verdict',
      async () => {
         await assertAuditFailOnRespected(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
});

describe('CLI audit conformance level', () => {
   it(
      'applies AA to automated rules and the criterion assessment',
      async () => {
         const result = await runCli([
            'audit',
            `${testServer.getBaseUrl()}/basic-page.html`,
            '--level',
            'AA',
            '--json',
         ]);
         const json = parseJsonOutput(result.stdout);

         expect(result.status).toBe(EXIT_SUCCESS);
         expect(json.result).toHaveProperty(
            'axe.selection',
            expect.objectContaining({ kind: 'level', level: 'AA' }),
         );
         expect(json.result).toHaveProperty(
            'criteria',
            expect.arrayContaining([
               expect.objectContaining({ level: 'A' }),
               expect.objectContaining({ level: 'AA' }),
            ]),
         );
         expect(json.result).toHaveProperty(
            'criteria',
            expect.not.arrayContaining([expect.objectContaining({ level: 'AAA' })]),
         );
      },
      TEST_TIMEOUT_LONG,
   );
});
