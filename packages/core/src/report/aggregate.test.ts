import { describe, expect, it } from 'vitest';

import type { AuditReport } from '../audit/runtime.js';
import { buildAggregateEarlReport, buildReportModel } from './aggregate.js';
import { buildReportTestInventory } from './test-fixtures.js';

function buildAuditReport(): AuditReport {
   return {
      axe: {
         url: 'https://example.test/',
         wcagVersion: '2.2',
         selection: { kind: 'all', resolvedRuleIds: ['color-contrast'] },
         ruleIds: ['color-contrast'],
         violations: [
            {
               id: 'color-contrast',
               impact: 'serious',
               description: 'Text must have enough contrast.',
               help: 'Fix the foreground or background color.',
               helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/color-contrast',
               tags: ['wcag143'],
               nodes: [
                  {
                     target: ['main p'],
                     html: '<p>Low contrast</p>',
                     failureSummary: 'Increase the contrast ratio.',
                  },
               ],
            },
         ],
         passes: [],
         incomplete: [],
         inapplicable: [],
      },
      tree: {
         pageTitle: 'Example',
         firstHeading: 'Example',
         counts: { landmarks: 1, headings: 1, links: 0, buttons: 0, formControls: 0 },
         headingLevels: [1],
         roles: ['heading', 'main'],
      },
      relevance: {
         signals: [],
         matrix: {
            version: '2.2',
            target: { kind: 'url', value: 'https://example.test/' },
            assessments: {},
         },
      },
      criteria: [
         {
            id: '1.4.3',
            title: 'Contrast (Minimum)',
            level: 'AA',
            axeVerdict: 'fail',
            relevance: 'relevant',
            testMethod: 'automated',
            evidenceMode: 'automated',
            procedureIds: ['axe_scan'],
            pending: false,
         },
      ],
      recorded: [],
   };
}

describe('report aggregation', () => {
   it('counts page outcomes and merges EARL assertions', () => {
      const pageReports = [{ pageId: 'home-a1b2c3d4', report: buildAuditReport() }];
      const earl = buildAggregateEarlReport(pageReports, {
            profile: 'report',
            version: '0.1.0',
         }),
         model = buildReportModel(buildReportTestInventory(), pageReports);

      expect(model.totals.outcomes.failed).toStrictEqual(1);
      expect(model.totals.violations.serious).toStrictEqual(1);
      expect(earl['@graph']).toHaveLength(1);
   });
});
