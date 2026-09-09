import { describe, expect, it } from 'vitest';

import {
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   TEST_TIMEOUT_VERY_LONG,
   parseJsonOutput,
   runCli,
   runCliInProcess,
   useTestServer,
} from './setup.js';

/*
 * The APG examples are correct by construction, so a finding against one of them is a false
 * positive in a11ied rather than a bug in the page. These cases hold the check to that, and
 * hold it to still catching the real breaks in aria-widgets.html.
 *
 * Each fixture is checked once and every assertion about it reads that one result. The
 * checks also run the CLI in process rather than spawning it, so they share one browser: a
 * check reloads the page for every key it presses, and a browser per call starves the other
 * suites that need one. The axe runs still spawn, because axe's own page function does not
 * survive the test build's transform.
 */
const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);

const COMBOBOX = 'apg/patterns/combobox/examples/combobox-select-only.html';
const DISCLOSURE = 'apg/patterns/disclosure/examples/disclosure-faq.html';
const BANNER = 'apg/patterns/landmarks/examples/banner.html';

interface CheckResult {
   keyboardRows: Array<{ rowKey: string; status: string; chord?: string }>;
   attributeRows: Array<{ rowKey: string; status: string; reason?: string }>;
   applicabilityHints: Array<{ attribute: string }>;
   unprobedTables: string[];
}

interface CheckRun {
   status: number;
   result: CheckResult;
}

interface AxeResult {
   violations: Array<{ id: string }>;
}

interface FixtureSpec {
   path: string;
   example: string;
   selector: string;
   /** A selector to click after the page loads, for a widget that is not there until then. */
   click?: string;
}

async function checkFixture(spec: FixtureSpec): Promise<CheckRun> {
   const run = await runCliInProcess([
      'pattern',
      'check',
      `${testServer.getBaseUrl()}/${spec.path}`,
      '--pattern',
      spec.example,
      '--selector',
      spec.selector,
      ...(spec.click === undefined ? [] : ['--click', spec.click]),
      '--json',
   ]);

   return {
      status: run.status,
      result: parseJsonOutput(run.stdout).result as CheckResult,
   };
}

/*
 * Scoped to the widget on purpose. An APG example page wraps the widget in the guide's own
 * documentation, and that wrapper has its own small navigation links and AAA contrast
 * shortfalls. Those say nothing about the widget, which is what the fixture is here to test.
 */
async function violationsOf(path: string, selector: string): Promise<string[]> {
   const run = await runCli([
      'axe',
      `${testServer.getBaseUrl()}/${path}`,
      '--selector',
      selector,
      '--json',
   ]);
   const result = parseJsonOutput(run.stdout).result as AxeResult;

   return result.violations.map((violation) => violation.id).toSorted();
}

/*
 * One browser run per fixture, shared by every assertion about it. Started on first use and
 * remembered, so a second test reads the same result instead of driving the page again.
 */
const startedChecks = new Map<string, Promise<CheckRun>>();

const FIXTURES = {
   combobox: { path: COMBOBOX, example: 'combobox-select-only', selector: '#ex1' },
   disclosure: { path: DISCLOSURE, example: 'disclosure-faq', selector: '#ex1' },
   checkbox: {
      path: 'aria-widgets.html',
      example: 'checkbox',
      selector: '#stateless-checkbox',
   },
   /*
    * The checkbox example rather than the combobox one. Both document `aria-labelledby`, and
    * this one has two keyboard rows instead of eight, so the check drives the browser for a
    * fraction as long.
    */
   dangling: {
      path: 'aria-widgets.html',
      example: 'checkbox',
      selector: '#dangling-name',
   },
   /* The dialog is not on the page until its button is clicked. */
   dialog: {
      path: 'dialog.html',
      example: 'dialog',
      selector: '[role="dialog"]',
      click: '#open-dialog',
   },
   /* The disclosure example is the shortest one that documents `aria-controls`. */
   emptyControls: {
      path: 'aria-widgets.html',
      example: 'disclosure-faq',
      selector: '#empty-controls',
   },
} as const;

function checkOnce(key: keyof typeof FIXTURES): Promise<CheckRun> {
   const started = startedChecks.get(key) ?? checkFixture(FIXTURES[key]);
   startedChecks.set(key, started);
   return started;
}

function deadKeysIn(run: CheckRun): string[] {
   return run.result.keyboardRows
      .filter((row) => row.status === 'no-observable-effect')
      .map((row) => row.rowKey);
}

describe('the vendored APG examples', () => {
   it(
      'reports no axe violations against the widget itself',
      async () => {
         expect(await violationsOf(COMBOBOX, '#ex1')).toEqual([]);
         expect(await violationsOf(DISCLOSURE, '#ex1')).toEqual([]);
         expect(await violationsOf(BANNER, 'header')).toEqual([]);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'finds every declared key working on the select-only combobox',
      async () => {
         const combobox = await checkOnce('combobox');

         expect(deadKeysIn(combobox)).toEqual([]);
         expect(combobox.status).toBe(EXIT_SUCCESS);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'lists the keyboard table it skipped, so nobody reads it as full coverage',
      async () => {
         const combobox = await checkOnce('combobox');

         expect(combobox.result.unprobedTables).toEqual(['Listbox Popup']);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'does not fail an attribute the widget only sets in another state',
      async () => {
         const combobox = await checkOnce('combobox');

         const activedescendant = combobox.result.attributeRows.filter((row) =>
            row.rowKey.startsWith('combobox-aria-activedescendant'),
         );

         expect(activedescendant.every((row) => row.status === 'absent')).toBe(true);
         expect(combobox.status).toBe(EXIT_SUCCESS);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'tells two disclosure buttons apart, which have neither an id nor a role',
      async () => {
         const disclosure = await checkOnce('disclosure');

         expect(deadKeysIn(disclosure)).toEqual([]);
         expect(disclosure.status).toBe(EXIT_SUCCESS);
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('the pattern check against a broken widget', () => {
   it(
      'reports the key that does nothing and still passes the key that works',
      async () => {
         const checkbox = await checkOnce('checkbox');

         const byChord = new Map(
            checkbox.result.keyboardRows.map((row) => [
               row.chord ?? row.rowKey,
               row.status,
            ]),
         );

         expect(byChord.get('Space')).toBe('no-observable-effect');
         expect(byChord.get('Tab')).toBe('changed');
         expect(checkbox.status).toBe(EXIT_ASSERTION);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'names the attribute the widget never sets as a hint rather than a failure',
      async () => {
         const checkbox = await checkOnce('checkbox');

         expect(
            checkbox.result.applicabilityHints.map((hint) => hint.attribute),
         ).toContain('aria-checked');
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('the pattern check behind a click', () => {
   it(
      'opens the dialog before every probe, so its keys and attributes are checked',
      async () => {
         const dialog = await checkOnce('dialog');
         const byKey = new Map(
            dialog.result.attributeRows.map((row) => [row.rowKey, row.status]),
         );

         expect(deadKeysIn(dialog)).toEqual([]);
         expect(byKey.get('dialog-role[0]')).toBe('present');
         expect(byKey.get('aria-modal[3]')).toBe('present');
         expect(dialog.status).toBe(EXIT_SUCCESS);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   /* The fixture keeps the closed dialog in the DOM, hidden, so its keys reach nothing. */
   it(
      'finds every key dead when nothing opens the dialog first',
      async () => {
         const closed = await checkFixture({
            path: 'dialog.html',
            example: 'dialog',
            selector: '[role="dialog"]',
         });

         expect(deadKeysIn(closed)).not.toEqual([]);
         expect(closed.status).toBe(EXIT_ASSERTION);
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('the pattern check on an id reference', () => {
   it(
      'fails a reference that points at an id the document does not have',
      async () => {
         const danglingName = await checkOnce('dangling');

         const broken = danglingName.result.attributeRows.find(
            (row) => row.status === 'broken-reference',
         );

         expect(broken?.reason).toMatch(/points at an id that is not in the document/u);
         expect(danglingName.status).toBe(EXIT_ASSERTION);
      },
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'reports a reference set to an empty string as absent, not as present',
      async () => {
         const emptyControls = await checkOnce('emptyControls');

         const controls = emptyControls.result.attributeRows.find((row) =>
            row.rowKey.startsWith('button-aria-controls'),
         );

         expect(controls?.status).toBe('absent');
         expect(controls?.reason).toBe('set to an empty value on 1 element');
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});

describe('the pattern check scope', () => {
   it(
      'refuses to guess which widget to check',
      async () => {
         const run = await runCli([
            'pattern',
            'check',
            `${testServer.getBaseUrl()}/${COMBOBOX}`,
            '--pattern',
            'combobox-select-only',
            '--selector',
            'div',
            '--json',
         ]);

         expect(run.stdout).toContain('selector-not-unique');
      },
      TEST_TIMEOUT_VERY_LONG,
   );
});
