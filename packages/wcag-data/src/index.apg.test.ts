import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseApgExample } from './sources/apg/example.js';
import { parseExampleIndex, parsePatternIndex } from './sources/apg/index-pages.js';
import { ApgParseError } from './sources/apg/shared.js';
import { getWcagDataDirectories } from './sources/definitions.js';

const SAMPLE_DIR = join(getWcagDataDirectories().test, 'apg');

const MIN_EXAMPLE_COUNT = 50;
const MIN_PATTERN_COUNT = 20;
const CLOSED_COMBOBOX_ROW_COUNT = 8;
const DOWN_ARROW_DESCRIPTION_COUNT = 2;

async function readSample(name: string): Promise<string> {
   return readFile(join(SAMPLE_DIR, `${name}.html`), 'utf8');
}

describe('parseExampleIndex', () => {
   it('lists every example the index links, with both URLs derived from the href', async () => {
      const index = parseExampleIndex(await readSample('example-index'));

      const combobox = index.examples.find(
         (entry) => entry.id === 'combobox-select-only',
      );

      expect(index.examples.length).toBeGreaterThanOrEqual(MIN_EXAMPLE_COUNT);
      expect(combobox).toEqual({
         id: 'combobox-select-only',
         patternId: 'combobox',
         title: 'Select-Only Combobox',
         pageUrl:
            'https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/',
         sourceUrl:
            'https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/combobox/examples/combobox-select-only.html',
         experimental: false,
      });
   });

   it('reads the role index the page publishes rather than deriving one', async () => {
      const index = parseExampleIndex(await readSample('example-index'));

      expect(index.roleIndex.combobox).toEqual([
         'combobox-autocomplete-both',
         'combobox-autocomplete-list',
         'combobox-autocomplete-none',
         'combobox-datepicker',
         'combobox-select-only',
         'grid-combo',
      ]);
   });

   it('reads the attribute index the page publishes', async () => {
      const index = parseExampleIndex(await readSample('example-index'));

      expect(index.attributeIndex['aria-expanded']).toContain('combobox-select-only');
   });

   it('marks an example listed under Experimental Examples', async () => {
      const index = parseExampleIndex(await readSample('example-index'));

      const experimental = index.examples.filter((entry) => entry.experimental);

      expect(experimental.map((entry) => entry.id)).toContain('listbox-actions');
   });

   it('fails rather than writing a small artifact when the page has no example links', () => {
      expect(() => parseExampleIndex('<html><body><p>nothing</p></body></html>')).toThrow(
         ApgParseError,
      );
   });
});

describe('parsePatternIndex', () => {
   it('takes each pattern title from the page rather than from its slug', async () => {
      const patterns = parsePatternIndex(await readSample('pattern-index'));

      const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]));

      expect(patterns.length).toBeGreaterThanOrEqual(MIN_PATTERN_COUNT);
      expect(byId.get('alertdialog')?.title).toBe('Alert and Message Dialogs');
      expect(byId.get('accordion')?.title).toBe(
         'Accordion (Sections With Show/Hide Functionality)',
      );
      expect(byId.get('combobox')?.pageUrl).toBe(
         'https://www.w3.org/WAI/ARIA/apg/patterns/combobox/',
      );
   });

   it('fails when the page lists no patterns', () => {
      expect(() => parsePatternIndex('<html><body><p>nothing</p></body></html>')).toThrow(
         ApgParseError,
      );
   });
});

describe('parseApgExample', () => {
   it('reads one table per documented state, named by its sub-heading', async () => {
      const parsed = parseApgExample(await readSample('combobox-select-only'));

      expect(parsed.keyboardTables.map((table) => table.name)).toEqual([
         'Closed Combobox',
         'Listbox Popup',
      ]);
      expect(parsed.keyboardTables[0]?.rows).toHaveLength(CLOSED_COMBOBOX_ROW_COUNT);
   });

   it('keeps a modifier chord in one group', async () => {
      const parsed = parseApgExample(await readSample('combobox-select-only'));

      const row = parsed.keyboardTables[0]?.rows.find(
         (entry) => entry.testId === 'combobox-key-alt-down-arrow',
      );

      expect(row?.keyGroups).toEqual([['Alt', 'Down Arrow']]);
   });

   it('splits alternatives joined by "or" into separate groups', async () => {
      const parsed = parseApgExample(await readSample('accordion'));

      const rows = parsed.keyboardTables[0]?.rows ?? [];
      const alternative = rows.find((row) => row.keyGroups.length > 1);

      expect(alternative?.keyGroups).toEqual([['Space'], ['Enter']]);
   });

   it('splits alternatives separated by a line break into separate groups', async () => {
      const parsed = parseApgExample(await readSample('menu-button-actions'));

      const row = parsed.keyboardTables[0]?.rows.find((entry) =>
         entry.keyGroups.some((group) => group.includes('Down Arrow')),
      );

      expect(row?.keyGroups).toEqual([['Down Arrow'], ['Space'], ['Enter']]);
   });

   it('reads one description entry per list item', async () => {
      const parsed = parseApgExample(await readSample('combobox-select-only'));

      const row = parsed.keyboardTables[0]?.rows.find(
         (entry) => entry.testId === 'combobox-key-down-arrow',
      );

      expect(row?.description).toHaveLength(DOWN_ARROW_DESCRIPTION_COUNT);
   });
});

describe('parseApgExample attribute tables', () => {
   it('keeps both rows when the APG repeats a data-test-id for two attribute values', async () => {
      const parsed = parseApgExample(await readSample('combobox-select-only'));

      const expanded = parsed.attributeTables[0]?.rows.filter(
         (row) => row.testId === 'combobox-aria-expanded',
      );

      expect(expanded?.map((row) => row.attribute?.value)).toEqual(['false', 'true']);
   });

   it('marks an IDREF placeholder rather than storing it as a literal value', async () => {
      const parsed = parseApgExample(await readSample('combobox-select-only'));

      const controls = parsed.attributeTables[0]?.rows.find(
         (row) => row.attribute?.name === 'aria-controls',
      );

      expect(controls?.attribute).toEqual({
         raw: 'aria-controls="#IDREF"',
         name: 'aria-controls',
         value: '#IDREF',
         isIdRef: true,
      });
   });

   it('leaves a one-table example unnamed', async () => {
      const parsed = parseApgExample(await readSample('disclosure-faq'));

      expect(parsed.keyboardTables).toHaveLength(1);
      expect(parsed.keyboardTables[0]?.name).toBe('');
   });

   it('ignores demo tables that share the attribute table class', async () => {
      const parsed = parseApgExample(await readSample('data-grids'));

      expect(parsed.attributeTables).toHaveLength(1);
   });

   it('returns empty lists for an example the APG documents without tables', async () => {
      const parsed = parseApgExample(await readSample('banner'));

      expect(parsed.keyboardTables).toEqual([]);
      expect(parsed.attributeTables).toEqual([]);
   });
});
