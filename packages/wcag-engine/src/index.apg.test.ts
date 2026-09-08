import { describe, expect, it } from 'vitest';

import {
   findApgExamplesByAttribute,
   findApgExamplesByRole,
   getApgDocument,
   getApgExample,
   getApgPattern,
   listApgExamplesForPattern,
   listApgPatterns,
   resolveApgLookupKey,
   WcagEngineNotFoundError,
} from './index.js';

const MIN_PATTERN_COUNT = 20;
const COMBOBOX_EXAMPLE_COUNT = 6;

describe('APG lookups', () => {
   it('returns one table per documented state for an example', () => {
      const example = getApgExample('combobox-select-only');

      expect(example.keyboardTables.map((table) => table.name)).toEqual([
         'Closed Combobox',
         'Listbox Popup',
      ]);
      expect(example.patternId).toBe('combobox');
   });

   it('raises a not-found error naming the lookup key', () => {
      expect(() => getApgExample('no-such-example')).toThrow(WcagEngineNotFoundError);
      expect(() => getApgExample('no-such-example')).toThrow('no-such-example');
   });

   it('resolves a bare argument to a pattern or to an example', () => {
      expect(resolveApgLookupKey('combobox')).toEqual({
         kind: 'pattern',
         id: 'combobox',
      });
      expect(resolveApgLookupKey('combobox-select-only')).toEqual({
         kind: 'example',
         id: 'combobox-select-only',
      });
      expect(resolveApgLookupKey('nope')).toBeUndefined();
   });
});

describe('APG index lookups', () => {
   it('lists the examples the APG files under a role, whatever the caller capitalizes', () => {
      const lower = findApgExamplesByRole('combobox'),
         upper = findApgExamplesByRole('Combobox');

      expect(lower.map((example) => example.id)).toEqual([
         'combobox-autocomplete-both',
         'combobox-autocomplete-list',
         'combobox-autocomplete-none',
         'combobox-datepicker',
         'combobox-select-only',
         'grid-combo',
      ]);
      expect(upper).toEqual(lower);
   });

   it('lists the examples the APG files under an attribute', () => {
      const examples = findApgExamplesByAttribute('aria-expanded');

      expect(examples.map((example) => example.id)).toContain('combobox-select-only');
   });
});

describe('APG pattern listings', () => {
   it('takes the pattern title from the APG rather than from the slug', () => {
      expect(getApgPattern('alertdialog').title).toBe('Alert and Message Dialogs');
   });

   it('lists every pattern with an example count', () => {
      const patterns = listApgPatterns();

      const combobox = patterns.find((pattern) => pattern.id === 'combobox');

      expect(patterns.length).toBeGreaterThanOrEqual(MIN_PATTERN_COUNT);
      expect(combobox?.exampleCount).toBe(COMBOBOX_EXAMPLE_COUNT);
   });

   it('lists every example a pattern records, all filed under that pattern', () => {
      const examples = listApgExamplesForPattern('disclosure');

      expect(examples.map((example) => example.patternId)).toEqual(
         examples.map(() => 'disclosure'),
      );
   });

   it('carries the APG attribution for a command to print', () => {
      const document = getApgDocument();

      expect(document.url).toBe('https://www.w3.org/WAI/ARIA/apg/');
      expect(document.status).toContain('not a W3C Recommendation');
   });

   it('reads the artifact once across repeated lookups', () => {
      const first = getApgExample('disclosure-faq'),
         second = getApgExample('disclosure-faq');

      expect(first).toBe(second);
   });
});
