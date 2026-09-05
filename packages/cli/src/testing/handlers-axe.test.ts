import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_LONG,
} from './setup.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

async function assertAxeFullScan(baseUrl: string): Promise<void> {
   const result = await runCli(['axe', `${baseUrl}/basic-page.html`, '--json']);
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
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
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
      `${baseUrl}/contrast-failure.html`,
      '--level',
      'AA',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
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
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
   ]);
   expect(output.stdout.replaceAll(baseUrl, '<base>')).toMatchInlineSnapshot(`
     "axe scan
       URL:        <base>/button-name-failure.html
       Selection:  criterion=4.1.2
       Result:     1 violation, 0 incomplete checks, 2 passes
       Verdict:    fail  1 finding at or above --fail-on minor

     Violations (1)
       ✗ button-name  critical  WCAG 4.1.2 (A)
           Buttons must have discernible text
           https://dequeuniversity.com/rules/axe/4.13/button-name?application=axeAPI
           1 failing element
             button
               <button type="button"></button>
               Fix any of the following:
               • Element does not have inner text that is visible to screen readers
               • aria-label attribute does not exist or is empty
               • aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
               • Element has no title attribute
               • Element does not have an implicit (wrapped) <label>
               • Element does not have an explicit <label>
               • Element's default semantics were not overridden with role="none" or role="presentation"

     Incomplete (0)
       none

     Passes (2)
       ✓ aria-hidden-body  aria-hidden="true" must not be present on the document body
       ✓ nested-interactive  Interactive controls must not be nested
     "
   `);
}

async function assertAxeVerboseOutput(baseUrl: string): Promise<void> {
   const verbose = await runCli([
      'axe',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--verbose',
   ]);
   expect(verbose.stdout).toMatch(/URL:\s+http/);
   expect(verbose.stdout).toContain(`${baseUrl}/button-name-failure.html`);
   expect(verbose.stdout).toContain('Rule ids');
}

const fixturePath = resolve(
   import.meta.dirname,
   '../../test/fixtures/button-name-failure.html',
);

async function assertAxeFileTarget(): Promise<void> {
   const result = await runCli(['axe', fixturePath, '--criterion', '4.1.2', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect((json.target as { kind: string }).kind).toBe('file');
   expect(
      (json.result as { violations: Array<{ id: string }> }).violations.some(
         (entry) => entry.id === 'button-name',
      ),
   ).toBe(true);
}

async function assertAxeInlineHtmlTarget(): Promise<void> {
   const result = await runCli(['axe', '--html', '<img src=x>', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ASSERTION);
   expect((json.target as { kind: string }).kind).toBe('html');
   expect(
      (json.result as { violations: Array<{ id: string }> }).violations.some(
         (entry) => entry.id === 'image-alt',
      ),
   ).toBe(true);
}

async function assertAxeMissingTarget(): Promise<void> {
   const result = await runCli(['axe', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect(json.ok).toBe(false);
   expect((json.errors as Array<{ code: string }>)[0]?.code).toBe('missing-target');
}

async function assertAxeAppTargetRejected(): Promise<void> {
   const result = await runCli(['axe', 'app:Safari', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect((json.errors as Array<{ code: string; message: string }>)[0]?.code).toBe(
      'target-unsupported',
   );
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(/a1 sr/);
}

describe('cli run axe / scan commands', () => {
   it(
      'scans all mapped axe rules by default',
      async () => {
         await assertAxeFullScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'scans with criterion filter',
      async () => {
         await assertAxeCriterionScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'scans with level filter',
      async () => {
         await assertAxeLevelScan(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'scans with rule filter',
      async () => {
         await assertAxeRuleFilter(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'reports incomplete results',
      async () => {
         await assertAxeIncomplete(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
});

describe('cli run axe / target grammar', () => {
   it('scans a local file target', assertAxeFileTarget, TEST_TIMEOUT_LONG);
   it('scans inline --html', assertAxeInlineHtmlTarget, TEST_TIMEOUT_LONG);
   it('rejects a missing target', assertAxeMissingTarget, TEST_TIMEOUT_LONG);
   it('rejects an app target', assertAxeAppTargetRejected, TEST_TIMEOUT_LONG);
});

describe('cli run axe / output formatting', () => {
   it(
      'keeps text output readable',
      async () => {
         await assertAxeTextOutput(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'keeps verbose output readable',
      async () => {
         await assertAxeVerboseOutput(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
});
