import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   TEST_TIMEOUT_MEDIUM,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

async function assertAxeFullScan(baseUrl: string): Promise<void> {
   const result = await runCli(['axe', '--url', `${baseUrl}/basic-page.html`, '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const axeResult = json.result as {
      selection: { kind: string };
      ruleIds: string[];
      passes: unknown[];
      incomplete: unknown[];
   };
   expect(axeResult.selection.kind).toBe('all');
   expect(axeResult.ruleIds.length).toBeGreaterThan(10);
   expect(Array.isArray(axeResult.passes)).toBe(true);
   expect(Array.isArray(axeResult.incomplete)).toBe(true);
}

async function assertAxeCriterionScan(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      '--url',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const violations = (
      json.result as {
         violations: Array<{
            id: string;
            helpUrl: string;
            nodes: Array<{ target: string[] }>;
         }>;
      }
   ).violations;
   expect(violations.length).toBeGreaterThan(0);
   expect(
      violations.every(
         (entry) => Boolean(entry.helpUrl) && (entry.nodes[0]?.target.length ?? 0) > 0,
      ),
   ).toBe(true);
}

async function assertAxeLevelScan(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      '--url',
      `${baseUrl}/contrast-failure.html`,
      '--level',
      'AA',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(
      (json.result as { violations: Array<{ id: string }> }).violations.some(
         (entry) => entry.id === 'color-contrast',
      ),
   ).toBe(true);
   expect(Array.isArray((json.result as { passes: unknown[] }).passes)).toBe(true);
   expect(Array.isArray((json.result as { incomplete: unknown[] }).incomplete)).toBe(
      true,
   );
}

async function assertAxeRuleFilter(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--rule',
      'color-contrast',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   const axeResult = json.result as {
      violations: Array<{ id: string }>;
      passes: Array<{ id: string }>;
      incomplete: Array<{ id: string }>;
      inapplicable: Array<{ id: string }>;
   };
   const seenRuleIds = [
      ...axeResult.violations.map((entry) => entry.id),
      ...axeResult.passes.map((entry) => entry.id),
      ...axeResult.incomplete.map((entry) => entry.id),
      ...axeResult.inapplicable.map((entry) => entry.id),
   ];
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(new Set(seenRuleIds)).toEqual(new Set(['color-contrast']));
}

async function assertAxeIncomplete(baseUrl: string): Promise<void> {
   const result = await runCli([
      'axe',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--rule',
      'frame-tested',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(
      (json.result as { incomplete: Array<{ id: string }> }).incomplete.some(
         (entry) => entry.id === 'frame-tested',
      ),
   ).toBe(true);
}

async function assertAxeTextOutput(baseUrl: string): Promise<void> {
   const output = await runCli([
      'axe',
      '--url',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
   ]);
   expect(output.stdout).toMatchInlineSnapshot(`
      "Selection: criterion=4.1.2
      Violations: button-name (critical)
      Passes: aria-hidden-body, nested-interactive
      Incomplete: none
      "
    `);
}

async function assertAxeVerboseOutput(baseUrl: string): Promise<void> {
   const verbose = await runCli([
      'axe',
      '--url',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--verbose',
   ]);
   expect(verbose.stdout).toContain(`URL: ${baseUrl}/button-name-failure.html`);
   expect(verbose.stdout).toContain('Rule ids:');
}

describe('cli run axe / scan commands', () => {
   it(
      'scans all mapped axe rules by default',
      async () => {
         await assertAxeFullScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'scans with criterion filter',
      async () => {
         await assertAxeCriterionScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'scans with level filter',
      async () => {
         await assertAxeLevelScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'scans with rule filter',
      async () => {
         await assertAxeRuleFilter(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'reports incomplete results',
      async () => {
         await assertAxeIncomplete(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );
});

describe('cli run axe / output formatting', () => {
   it(
      'keeps text output readable',
      async () => {
         await assertAxeTextOutput(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );

   it(
      'keeps verbose output readable',
      async () => {
         await assertAxeVerboseOutput(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_MEDIUM,
   );
});
