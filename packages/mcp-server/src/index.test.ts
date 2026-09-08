import {
   axeRuleLookupResultSchema,
   testMethodLookupResultSchema,
   unifiedSearchResultSchema,
} from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import {
   BASIC_PAGE,
   BUTTON_NAME_FAILURE,
   ONE_MINUTE_MS,
   withHarness,
} from './testing/harness.js';

const CLI_EXIT_ASSERTION = 4;

describe('wcag show tool', () => {
   it('matches the CLI wcag show command, test method included', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_show',
            arguments: { criterion: '4.1.3', version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = testMethodLookupResultSchema.parse(result.structuredContent);
         expect(payload.lookupKey).toBe('4.1.3');
         expect(payload.criterion.id).toBe('4.1.3');
         expect(payload.criterion.slug).toBe('status-messages');
         expect(payload.testMethod).toBeDefined();
         expect(payload.strategy).toBeDefined();
      });
   });

   it('looks up a technique id, matching wcag show G18', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_show',
            arguments: { criterion: 'G18' },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as {
            technique: { id: string };
            criteria: Array<{ id: string }>;
         };
         expect(payload.technique.id).toBe('G18');
         expect(payload.criteria.some((criterion) => criterion.id === '1.4.3')).toBe(
            true,
         );
      });
   });

   it('includes a technique body when the sync fetched one', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_show',
            arguments: { criterion: 'G164' },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as {
            technique: { id: string };
            body?: string;
            document?: { url: string };
         };
         expect(payload.technique.id).toBe('G164');
         expect(payload.body?.length).toBeGreaterThan(0);
         expect(payload.document?.url).toBe(
            'https://www.w3.org/WAI/WCAG22/Techniques/general/G164',
         );
      });
   });
});

describe('wcag show tool with includeUnderstanding', () => {
   it('includes the full Understanding document when includeUnderstanding is set', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_show',
            arguments: { criterion: '2.4.2', includeUnderstanding: true },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as {
            understandingExcerpt?: string;
            understanding?: { body: string; document: { url: string } };
         };
         expect(payload.understandingExcerpt?.length).toBeGreaterThan(0);
         expect(payload.understanding?.body.length).toBeGreaterThan(0);
         expect(payload.understanding?.document.url).toBe(
            'https://www.w3.org/WAI/WCAG22/Understanding/page-titled',
         );
      });
   });
});

describe('wcag criteria tool', () => {
   it('lists every criterion when level is omitted, matching a1 wcag criteria', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_criteria',
            arguments: { version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as {
            level: string;
            criteria: unknown[];
         };
         expect(payload.level).toBe('all');
         expect(payload.criteria.length).toBeGreaterThan(0);
      });
   });

   it('filters to one level, matching a1 wcag criteria --level', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_criteria',
            arguments: { level: 'A', version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as { level: string };
         expect(payload.level).toBe('A');
      });
   });

   it('returns the test method counts when summary is set, matching a1 wcag criteria --summary', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_criteria',
            arguments: { summary: true, version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = result.structuredContent as { totals: unknown };
         expect(payload.totals).toBeDefined();
      });
   });
});

describe('wcag rule tool', () => {
   it('maps an axe rule to its criteria, matching a1 wcag rule', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'wcag_rule',
            arguments: { ruleId: 'color-contrast', version: '2.2' },
         });

         expect(result.isError).toBeFalsy();
         const payload = axeRuleLookupResultSchema.parse(result.structuredContent);
         expect(payload.ruleId).toBe('color-contrast');
         expect(payload.criteria.length).toBeGreaterThan(0);
         expect(payload.helpUrl).toBeDefined();
      });
   });
});

describe('search tool', () => {
   it('returns ranked rows from both corpora, each labelled by kind', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'search',
            arguments: { query: 'combobox', version: '2.2', limit: 10 },
         });

         expect(result.isError).toBeFalsy();
         const payload = unifiedSearchResultSchema.parse(result.structuredContent);
         const kinds = new Set(payload.rows.map((row) => row.kind));

         expect(kinds.has('pattern')).toBe(true);
         expect(payload.rows.some((row) => row.id === 'combobox-select-only')).toBe(true);
      });
   });

   it('scopes the search to one corpus when kind is given', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.callTool({
            name: 'search',
            arguments: { query: 'status message', version: '2.2', kind: 'criterion' },
         });

         const payload = unifiedSearchResultSchema.parse(result.structuredContent);

         expect(payload.rows.every((row) => row.kind === 'criterion')).toBe(true);
         expect(payload.rows.some((row) => row.id === '4.1.3')).toBe(true);
      });
   });
});

describe('run_axe tool', () => {
   it(
      'runs every mapped rule when criterion, level, and ruleIds are all omitted',
      async () => {
         await withHarness(async (harness) => {
            const result = await harness.client.callTool({
               name: 'run_axe',
               arguments: { target: BUTTON_NAME_FAILURE },
            });

            expect(result.isError).toBeFalsy();
            const payload = result.structuredContent as {
               result: {
                  violations: Array<{ id: string }>;
                  verdict: { passed: boolean };
               };
               exitCode: number;
            };
            expect(
               payload.result.violations.some(
                  (violation) => violation.id === 'button-name',
               ),
            ).toBe(true);
            expect(payload.result.verdict.passed).toBe(false);
            expect(payload.exitCode).toBe(CLI_EXIT_ASSERTION);
         });
      },
      ONE_MINUTE_MS,
   );

   it(
      'rejects more than one of criterion, level, and ruleIds',
      async () => {
         await withHarness(async (harness) => {
            const result = await harness.client.callTool({
               name: 'run_axe',
               arguments: { target: BASIC_PAGE, level: 'A', criterion: '1.1.1' },
            });

            expect(result.isError).toBe(true);
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('tree tool', () => {
   it(
      'prints the accessibility tree, matching a1 tree',
      async () => {
         await withHarness(async (harness) => {
            const result = await harness.client.callTool({
               name: 'tree',
               arguments: { target: BASIC_PAGE },
            });

            expect(result.isError).toBeFalsy();
            const payload = result.structuredContent as { result: { yaml: string } };
            expect(payload.result.yaml).toContain('heading');
         });
      },
      ONE_MINUTE_MS,
   );

   it(
      'filters by role, keeping only matching nodes and their ancestors',
      async () => {
         await withHarness(async (harness) => {
            const result = await harness.client.callTool({
               name: 'tree',
               arguments: { target: BASIC_PAGE, role: 'heading' },
            });

            expect(result.isError).toBeFalsy();
            const payload = result.structuredContent as {
               result: { nodes: Array<{ role: string }> };
            };
            expect(payload.result.nodes.length).toBeGreaterThan(0);
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('audit tool', () => {
   it(
      'runs axe, tree, and the relevant criteria scan, and matches the CLI exit meaning',
      async () => {
         await withHarness(async (harness) => {
            const result = await harness.client.callTool({
               name: 'audit',
               arguments: { target: BUTTON_NAME_FAILURE },
            });

            expect(result.isError).toBeFalsy();
            const payload = result.structuredContent as {
               result: {
                  axe: unknown;
                  tree: unknown;
                  criteria: unknown[];
                  verdict: { passed: boolean };
                  nextCommands: string[];
               };
               exitCode: number;
            };
            expect(payload.result.verdict.passed).toBe(false);
            expect(payload.exitCode).toBe(CLI_EXIT_ASSERTION);
            expect(
               payload.result.nextCommands.some((cmd) => cmd.includes('button-name')),
            ).toBe(true);
         });
      },
      ONE_MINUTE_MS,
   );
});

describe('resource exposure', () => {
   it('lists read-only resources for standards material', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.listResources();
         const uris = result.resources.map((entry) => entry.uri);

         expect(uris).toContain('a11ied://wcag/criteria/2.2');
         expect(uris).toContain('a11ied://wcag/levels/2.2');
         expect(uris).toContain('a11ied://wcag/test-methods/2.2');

         const readTestMethod = await harness.client.readResource({
            uri: 'a11ied://wcag/test-methods/2.2',
         });
         expect(readTestMethod.contents[0]?.uri).toBe('a11ied://wcag/test-methods/2.2');
      });
   });
});

describe('tool metadata', () => {
   it('documents side effects for active tools', async () => {
      await withHarness(async (harness) => {
         const result = await harness.client.listTools();
         const sessionTool = result.tools.find((entry) => entry.name === 'sr_session');

         expect(sessionTool?.description).toContain('real');
         expect(sessionTool?.description).toContain('targetType');
      });
   });
});
