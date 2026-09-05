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
   applicability: {
      matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
   };
   criteria: Array<{
      id: string;
      axeVerdict: string;
      applicability: string;
      coverageState: string;
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

async function assertAuditReportsTreeAndApplicability(baseUrl: string): Promise<void> {
   const result = await runCli(['audit', `${baseUrl}/status-message.html`, '--json']);
   const json = parseJsonOutput(result.stdout);
   const audit = json.result as unknown as AuditResult;

   expect(audit.tree.pageTitle).toBeTruthy();
   expect(audit.tree.counts.headings).toBeGreaterThan(0);
   expect(audit.applicability.matrix.assessments['4.1.3']?.state).toBe('applicable');

   const rollupEntry = audit.criteria.find((entry) => entry.id === '4.1.3');
   expect(rollupEntry?.applicability).toBe('applicable');
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
   expect(verbose.stdout).toMatch(/Criterion\s+Level\s+Automated check\s+Applies here/);
   expect(verbose.stdout).toContain('failed');
   expect(verbose.stdout).not.toContain('axe=fail');
   expect(verbose.stdout).not.toContain('coverage=automated');
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
   expect(failing.stdout).not.toContain('applicability=not-detected');

   const passing = await runCli(['audit', `${baseUrl}/basic-page.html`]);
   expect(passing.stdout).toContain('Nothing failed the automated checks');
   expect(passing.stdout).not.toContain('Problems');

   await assertAuditVerboseTable(baseUrl);
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
      'reports a tree summary and signal-backed applicability',
      async () => {
         await assertAuditReportsTreeAndApplicability(testServer.getBaseUrl());
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
      '--fail-on carries through to the audit verdict',
      async () => {
         await assertAuditFailOnRespected(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
});
