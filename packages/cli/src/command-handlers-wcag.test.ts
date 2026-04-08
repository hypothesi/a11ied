import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   SEARCH_EXCERPT_LINES,
} from './command-handlers-setup.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

async function assertWcagLevels(): Promise<void> {
   const levelsResult = await runCli(['wcag', 'levels', '--json']);
   const levels = parseJsonOutput(levelsResult.stdout);
   expect(levels.ok).toBe(true);
   expect((levels.command as { wcagVersion?: string }).wcagVersion).toBe('2.2');
   expect((levels.result as { levels: string[] }).levels).toEqual(['A', 'AA', 'AAA']);
}

async function assertWcagCriteria(): Promise<void> {
   const result = await runCli([
      'wcag',
      'criteria',
      '--level',
      'AA',
      '--version',
      '2.1',
      '--json',
   ]);
   const criteria = parseJsonOutput(result.stdout);
   expect(criteria.ok).toBe(true);
   expect(
      (
         criteria.result as { criteria: Array<{ wcagVersion: string; level: string }> }
      ).criteria.every((entry) => entry.wcagVersion === '2.1' && entry.level === 'AA'),
   ).toBe(true);
}

async function assertWcagShow(): Promise<void> {
   const result = await runCli(['wcag', 'show', 'status-messages', '--json']);
   const show = parseJsonOutput(result.stdout);
   expect(show.ok).toBe(true);
   const criterion = (
      show.result as {
         criterion: { id: string; normativeText: string; understandingUrl: string };
      }
   ).criterion;
   expect(criterion.id).toBe('4.1.3');
   expect(criterion.normativeText).toBeTruthy();
   expect(criterion.understandingUrl).toBeTruthy();
}

async function assertWcagSearch(): Promise<void> {
   const result = await runCli(['wcag', 'search', 'status message', '--json']);
   const search = parseJsonOutput(result.stdout);
   expect(search.ok).toBe(true);
   expect(
      (
         search.result as { results: Array<{ criterionId: string; matches: unknown[] }> }
      ).results.some(
         (entry) => entry.criterionId === '4.1.3' && entry.matches.length > 0,
      ),
   ).toBe(true);
}

async function assertWcagCoverage(): Promise<void> {
   const result = await runCli(['wcag', 'coverage', '4.1.3', '--json']);
   const coverage = parseJsonOutput(result.stdout);
   expect(coverage.ok).toBe(true);
   expect(
      (
         coverage.result as {
            coverage: {
               coverageState: string;
               axeRuleIds: string[];
               actRuleIds: string[];
            };
         }
      ).coverage,
   ).toMatchObject({
      coverageState: expect.any(String),
      axeRuleIds: expect.any(Array),
      actRuleIds: expect.any(Array),
   });
   expect(
      (coverage.result as { strategy: { preferredEvidenceMode: string } }).strategy
         .preferredEvidenceMode,
   ).toBeTruthy();
}

async function assertWcagInvalidVersion(): Promise<void> {
   const result = await runCli([
      'wcag',
      'criteria',
      '--level',
      'AA',
      '--version',
      '2.0',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect(json.ok).toBe(false);
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(
      /2.0.*unsupported/i,
   );
}

async function assertInspectApplicable(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'applicable',
      '--url',
      `${baseUrl}/status-message.html`,
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const matrix = (
      json.result as {
         matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
      }
   ).matrix;
   expect(matrix.assessments['4.1.3']?.state).toBe('applicable');
   expect(matrix.assessments['4.1.3']?.reasons.length).toBeGreaterThan(0);
}

async function assertInspectCriterion(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { criterion: { id: string } }).criterion.id).toBe('4.1.3');
   expect(
      (json.result as { assessment: { state: string } }).assessment.state,
   ).toBeTruthy();
   expect((json.result as { signals: unknown[] }).signals.length).toBeGreaterThan(0);
}

async function assertInspectInvalidCriterion(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'criterion',
      '9.9.9',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(/9.9.9/i);
}

async function assertTextShowSnapshot(): Promise<void> {
   const show = await runCli(['wcag', 'show', 'status-messages']);
   expect(show.stdout).toMatchInlineSnapshot(`
      "4.1.3  Status Messages [AA]
      
      In content implemented using markup languages, status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus.
      
      Normative text: In content implemented using markup languages, status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus.
      Understanding: https://www.w3.org/WAI/WCAG22/Understanding/status-messages
      "
    `);
}

async function assertTextSearchSnapshot(): Promise<void> {
   const search = await runCli(['wcag', 'search', 'status message']);
   const excerpt = search.stdout.split('\n').slice(0, SEARCH_EXCERPT_LINES).join('\n');
   expect(excerpt).toMatchInlineSnapshot(`
      "Search: status message
      
      4.1.3  Status Messages [AA] score=35.5"
    `);
}

async function assertTextCriterionSnapshot(baseUrl: string): Promise<void> {
   const criterion = await runCli([
      'inspect',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
   ]);
   expect(criterion.stdout).toMatchInlineSnapshot(`
      "4.1.3  Status Messages
      State: applicable
      Signals: landmark=landmark structure; heading=heading structure; form=form controls; live-region=aria-live region; live-region=role=status
      Reason: Detected live region signals (aria-live region and role=status) and matching criterion tags (messaging, errors, forms, progress-steps, visual-cues, and content).
      "
    `);
}

async function assertTextVerboseSnapshots(baseUrl: string): Promise<void> {
   const verboseShow = await runCli(['wcag', 'show', 'status-messages', '--verbose']);
   expect(verboseShow.stdout).toContain('Slug: status-messages');
   const verboseCriterion = await runCli([
      'inspect',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
      '--verbose',
   ]);
   expect(verboseCriterion.stdout).toContain('Signals:');
}

describe('cli wcag commands', () => {
   it('checks wcag levels', async () => {
      await assertWcagLevels();
   });
   it('checks wcag criteria', async () => {
      await assertWcagCriteria();
   });
   it('checks wcag show', async () => {
      await assertWcagShow();
   });
   it('checks wcag search', async () => {
      await assertWcagSearch();
   });
   it('checks wcag coverage', async () => {
      await assertWcagCoverage();
   });
   it('rejects unsupported version', async () => {
      await assertWcagInvalidVersion();
   });
});

describe('cli inspect commands', () => {
   it('inspects applicable', async () => {
      await assertInspectApplicable(testServer.getBaseUrl());
   });
   it('inspects criterion', async () => {
      await assertInspectCriterion(testServer.getBaseUrl());
   });
   it('rejects invalid criterion', async () => {
      await assertInspectInvalidCriterion(testServer.getBaseUrl());
   });

   it('keeps representative text output readable', async () => {
      const baseUrl = testServer.getBaseUrl();
      await assertTextShowSnapshot();
      await assertTextSearchSnapshot();
      await assertTextCriterionSnapshot(baseUrl);
      await assertTextVerboseSnapshots(baseUrl);
   });
});
