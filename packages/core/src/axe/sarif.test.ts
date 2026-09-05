import { describe, expect, it } from 'vitest';

import type { AxeRunResult } from '@a11ied/contracts';

import { buildAxeSarifLog } from './sarif.js';

function buildResult(url: string): AxeRunResult {
   return {
      url,
      wcagVersion: '2.2',
      selection: { kind: 'all', resolvedRuleIds: ['button-name'] },
      ruleIds: ['button-name'],
      violations: [
         {
            id: 'button-name',
            impact: 'critical',
            description: 'Buttons must have discernible text',
            help: 'Buttons must have discernible text',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/button-name',
            tags: ['wcag412'],
            nodes: [
               {
                  target: ['button'],
                  html: '<button></button>',
                  failureSummary: 'Fix: add a label',
               },
            ],
         },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
   };
}

describe('buildAxeSarifLog', () => {
   it('builds one rule descriptor and one result per violating node', () => {
      const log = buildAxeSarifLog([buildResult('https://example.com')]);

      expect(log.version).toBe('2.1.0');
      expect(log.runs).toHaveLength(1);
      expect(log.runs[0]?.tool.driver.rules).toEqual([
         {
            id: 'button-name',
            name: 'button-name',
            shortDescription: { text: 'Buttons must have discernible text' },
            fullDescription: { text: 'Buttons must have discernible text' },
            helpUri: 'https://dequeuniversity.com/rules/axe/4.13/button-name',
         },
      ]);
      expect(log.runs[0]?.results).toEqual([
         {
            ruleId: 'button-name',
            level: 'error',
            message: { text: 'Fix: add a label' },
            locations: [
               {
                  physicalLocation: {
                     artifactLocation: { uri: 'https://example.com' },
                  },
                  logicalLocations: [{ fullyQualifiedName: 'button' }],
               },
            ],
         },
      ]);
   });

   it('merges rule descriptors across multiple targets without duplicates', () => {
      const targetUrls = ['https://example.com/a', 'https://example.com/b'];
      const log = buildAxeSarifLog(targetUrls.map((url) => buildResult(url)));

      expect(log.runs[0]?.tool.driver.rules).toHaveLength(1);
      expect(log.runs[0]?.results).toHaveLength(targetUrls.length);
   });
});
