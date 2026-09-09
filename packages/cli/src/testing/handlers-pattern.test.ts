import { describe, expect, it } from 'vitest';

import { runCli, parseJsonOutput, EXIT_SUCCESS } from './setup.js';
import { expectFirstErrorMessage } from './helpers.js';

const COMBOBOX_EXAMPLE_COUNT = 6;
const MIN_PATTERN_COUNT = 20;

interface PatternLookupResult {
   kind: string;
   pattern: { id: string; title: string };
   examples?: Array<{ id: string }>;
   example?: {
      id: string;
      keyboardTables: Array<{ name: string; rows: Array<{ keyGroups: string[][] }> }>;
      attributeTables: Array<{ rows: Array<{ attribute?: { name: string } }> }>;
   };
}

interface PatternListResult {
   patterns: Array<{ id: string; exampleCount: number }>;
}

interface PatternFindResult {
   kind: string;
   key: string;
   examples: Array<{ id: string }>;
}

describe('a1 pattern lookups', () => {
   it('resolves a bare pattern id to the pattern and its examples', async () => {
      const result = await runCli(['pattern', 'combobox', '--json']);

      const json = parseJsonOutput(result.stdout);
      const payload = json.result as PatternLookupResult;

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(payload.kind).toBe('pattern');
      expect(payload.pattern.title).toBe('Combobox');
      expect(payload.examples).toHaveLength(COMBOBOX_EXAMPLE_COUNT);
   });

   it('resolves a bare example id to that example and its tables', async () => {
      const result = await runCli(['pattern', 'combobox-select-only', '--json']);

      const json = parseJsonOutput(result.stdout);
      const payload = json.result as PatternLookupResult;

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(payload.kind).toBe('example');
      expect(payload.example?.keyboardTables.map((entry) => entry.name)).toEqual([
         'Closed Combobox',
         'Listbox Popup',
      ]);
   });

   it('keeps a modifier chord together and alternatives apart', async () => {
      const result = await runCli(['pattern', 'menu-button-actions', '--json']);

      const json = parseJsonOutput(result.stdout);
      const rows = (json.result as PatternLookupResult).example?.keyboardTables[0]?.rows;
      const alternatives = rows?.find((row) => row.keyGroups.length > 1);

      expect(alternatives?.keyGroups).toEqual([['Down Arrow'], ['Space'], ['Enter']]);
   });
});

describe('a1 pattern output', () => {
   it('prints only the attribute tables when --section names them', async () => {
      const result = await runCli([
         'pattern',
         'combobox-select-only',
         '--section',
         'attributes',
      ]);

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(result.stdout).toContain('Role, property, state, and tabindex');
      expect(result.stdout).not.toContain('Keyboard support');
   });

   it('rejects a section name the family does not have', async () => {
      const result = await runCli([
         'pattern',
         'combobox',
         '--section',
         'mobile',
         '--json',
      ]);

      expectFirstErrorMessage({ result, match: /Unknown section mobile/u });
   });

   it('exits with a usage error naming the key it could not resolve', async () => {
      const result = await runCli(['pattern', 'combo', '--json']);

      expectFirstErrorMessage({
         result,
         match: /No ARIA pattern or example named "combo"/u,
      });
   });

   it('wraps a long usage cell under its column instead of cutting it short', async () => {
      const result = await runCli(['pattern', 'dialog', '--section', 'attributes']);

      expect(result.stdout).not.toContain('\u2026');
      expect(result.stdout).toMatch(/Set on\s+Usage/u);
      expect(result.stdout).toContain('Tells assistive technologies that the windows');
   });

   it('labels the link to the example page and sets it apart from the attribution', async () => {
      const result = await runCli(['pattern', 'dialog']);

      expect(result.stdout).toContain(
         'See more: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/\n\n',
      );
   });

   it('prints the APG attribution and its own license wherever it prints APG prose', async () => {
      const result = await runCli(['pattern', 'disclosure-faq']);

      expect(result.stdout).toContain('W3C Software and Document License');
      expect(result.stdout).toContain('https://www.w3.org/WAI/ARIA/apg/');
   });
});

describe('a1 pattern listings', () => {
   it('lists every pattern with an example count', async () => {
      const result = await runCli(['pattern', 'list', '--json']);

      const json = parseJsonOutput(result.stdout);
      const payload = json.result as PatternListResult;

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(payload.patterns.length).toBeGreaterThanOrEqual(MIN_PATTERN_COUNT);
   });

   it('lists a pattern the guide publishes no example for, and says so', async () => {
      const listed = await runCli(['pattern', 'list', '--json']);
      const payload = parseJsonOutput(listed.stdout).result as PatternListResult;
      const shown = await runCli(['pattern', 'tooltip']);

      expect(payload.patterns.find((pattern) => pattern.id === 'tooltip')).toMatchObject({
         id: 'tooltip',
         title: 'Tooltip',
         exampleCount: 0,
      });
      expect(shown.status).toBe(EXIT_SUCCESS);
      expect(shown.stdout).toContain('The APG publishes no example for this pattern.');
      expect(shown.stdout).toContain(
         'See more: https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/',
      );
   });

   it('lists the examples the APG files under one role', async () => {
      const result = await runCli(['pattern', 'role', 'combobox', '--json']);

      const json = parseJsonOutput(result.stdout);
      const payload = json.result as PatternFindResult;

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(payload.kind).toBe('role');
      expect(payload.examples.map((example) => example.id)).toContain(
         'combobox-select-only',
      );
   });

   it('lists the examples the APG files under one attribute', async () => {
      const result = await runCli(['pattern', 'attribute', 'aria-expanded', '--json']);

      const json = parseJsonOutput(result.stdout);
      const payload = json.result as PatternFindResult;

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(payload.examples.map((example) => example.id)).toContain('disclosure-faq');
   });

   it('exits with a usage error for a role the index does not list', async () => {
      const result = await runCli(['pattern', 'role', 'nonsense', '--json']);

      expectFirstErrorMessage({
         result,
         match: /lists no examples for the role "nonsense"/u,
      });
   });
});
