import { describe, expect, it } from 'vitest';

import {
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_LONG,
   parseJsonOutput,
   runCli,
   useTestServer,
} from './setup.js';

/*
 * Each new fixture exists to fail a named set of rules. These cases hold it to that, so a
 * fixture edited for one test cannot quietly stop failing what another test relies on.
 */
const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);

interface AxeResult {
   violations: Array<{ id: string; nodes: unknown[] }>;
}

async function violationsOf(path: string, rules: string[] = []): Promise<string[]> {
   const ruleArgs = rules.flatMap((rule) => ['--rule', rule]);
   const run = await runCli([
      'axe',
      `${testServer.getBaseUrl()}/${path}`,
      ...ruleArgs,
      '--json',
   ]);
   const result = parseJsonOutput(run.stdout).result as AxeResult;

   return result.violations.map((violation) => violation.id).toSorted();
}

describe('the structural fixtures', () => {
   it(
      'reports a skipped heading level and an empty heading only when asked for the rules',
      async () => {
         expect(await violationsOf('heading-outline.html')).toEqual([]);
         expect(
            await violationsOf('heading-outline.html', [
               'heading-order',
               'empty-heading',
            ]),
         ).toEqual(['empty-heading', 'heading-order']);
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'reports duplicate landmarks and content outside every landmark',
      async () => {
         expect(
            await violationsOf('landmark-maze.html', [
               'landmark-unique',
               'landmark-no-duplicate-main',
               'region',
            ]),
         ).toEqual(['landmark-no-duplicate-main', 'landmark-unique', 'region']);
      },
      TEST_TIMEOUT_LONG,
   );
});

describe('the widget and form fixtures', () => {
   it(
      'reports the unnamed button, the stateless checkbox, and the dangling label',
      async () => {
         expect(await violationsOf('aria-widgets.html')).toEqual([
            'aria-required-attr',
            'button-name',
            'label',
         ]);
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'reports the unlabeled select and passes the field labeled only by a placeholder',
      async () => {
         expect(await violationsOf('form-errors.html')).toEqual(['select-name']);
         expect(await violationsOf('form-errors.html', ['label'])).toEqual([]);
      },
      TEST_TIMEOUT_LONG,
   );
});

describe('the fixtures whose problems are behavioral', () => {
   it(
      'finds nothing wrong with a page whose only problems are behavioral',
      async () => {
         expect(await violationsOf('live-regions.html')).toEqual([]);
         expect(await violationsOf('app/console.html')).toEqual([]);
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'names the unnamed dialog once the deep link renders it',
      async () => {
         expect(await violationsOf('modal-untrapped.html', ['aria-dialog-name'])).toEqual(
            [],
         );
         expect(
            await violationsOf('modal-untrapped.html#rename', ['aria-dialog-name']),
         ).toEqual(['aria-dialog-name']);
      },
      TEST_TIMEOUT_LONG,
   );

   it(
      'exits 4 on a fixture with violations and 0 on one without',
      async () => {
         const broken = await runCli([
            'axe',
            `${testServer.getBaseUrl()}/aria-widgets.html`,
         ]);
         const clean = await runCli([
            'axe',
            `${testServer.getBaseUrl()}/live-regions.html`,
         ]);

         expect(broken.status).toBe(EXIT_ASSERTION);
         expect(clean.status).toBe(EXIT_SUCCESS);
      },
      TEST_TIMEOUT_LONG,
   );
});
