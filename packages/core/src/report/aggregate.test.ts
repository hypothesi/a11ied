import { describe, expect, it } from 'vitest';
import { axeImpactSchema } from '@a11ied/contracts';

import type { AuditReport } from '../audit/runtime.js';
import { buildAggregateEarlReport, buildReportModel } from './aggregate.js';
import { buildReportTestInventory } from './test-fixtures.js';

const RULE_AND_CRITERION_ASSERTIONS = 56;

function buildAuditReport(): AuditReport {
   return {
      axe: {
         url: 'https://example.test/',
         wcagVersion: '2.2',
         selection: { kind: 'level', level: 'AA', resolvedRuleIds: ['color-contrast'] },
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
      expect(earl['@graph']).toHaveLength(RULE_AND_CRITERION_ASSERTIONS);
   });

   it('does not attach an audited result to a skipped duplicate', () => {
      const inventory = buildReportTestInventory();
      const [original] = inventory.pages;
      if (!original) {
         throw new Error('The fixture has no page.');
      }
      const duplicate = {
         ...original,
         pageId: 'home-alias-b2c3d4e5',
         url: 'http://example.test/',
         auditStatus: 'skipped-duplicate' as const,
         isDuplicateOf: original.pageId,
      };
      const pageReports = [{ pageId: 'home-a1b2c3d4', report: buildAuditReport() }];
      const model = buildReportModel(
         { ...inventory, pages: [...inventory.pages, duplicate] },
         pageReports,
      );
      const duplicatePage = model.pages[1];

      expect(model.totals.outcomes.failed).toStrictEqual(1);
      expect(model.totals.violations.serious).toStrictEqual(1);
      expect(duplicatePage?.criteria).to.eql([]);
      expect(duplicatePage?.findings).to.eql([]);
      expect(duplicatePage?.violationCounts).to.eql({
         minor: 0,
         moderate: 0,
         serious: 0,
         critical: 0,
      });
   });
});

describe('report evidence and missing results', () => {
   it('retains manual evidence without claiming methods that were never performed', () => {
      const inventory = buildReportTestInventory(),
         report = buildAuditReport();
      const automatic = buildReportModel(inventory, [
         { pageId: 'home-a1b2c3d4', report },
      ]);
      report.recorded.push({
         subject: report.axe.url,
         test: {
            kind: 'criterion',
            criterionId: '2.4.7',
            procedureId: 'focus_visibility_probe',
         },
         outcome: 'failed',
         mode: 'manual',
         recordedAt: new Date().toISOString(),
         pointer: '#submit',
         note: 'The focus indicator is missing.',
      });
      const manual = buildReportModel(inventory, [{ pageId: 'home-a1b2c3d4', report }]);
      const earl = buildAggregateEarlReport([{ pageId: 'home-a1b2c3d4', report }], {
         profile: 'report',
         version: '0.1.0',
      });

      expect(automatic.methodology.manual).toStrictEqual(false);
      expect(automatic.methodology.hybrid).toStrictEqual(false);
      expect(manual.methodology.manual).toStrictEqual(false);
      expect(
         earl['@graph'].some(
            (assertion) => assertion.result.info === 'The focus indicator is missing.',
         ),
      ).toStrictEqual(false);
      expect(manual.pages[0]?.recorded[0]?.note).toStrictEqual(
         'The focus indicator is missing.',
      );
   });

   it('does not count missing result files as audited pages', () => {
      const model = buildReportModel(buildReportTestInventory(), [
         { pageId: 'home-a1b2c3d4', error: 'Missing audit.json' },
      ]);

      expect(model.discovery.auditedPages).toStrictEqual(0);
      expect(model.pages[0]?.auditStatus).toStrictEqual('error');
   });
});

describe('report page error explanations', () => {
   it('keeps the recorded page reason while warning about unavailable scan files', () => {
      const inventory = buildReportTestInventory();
      const [page] = inventory.pages;
      if (!page) {
         throw new Error('The fixture has no page.');
      }
      page.auditStatus = 'error';
      page.error = {
         code: 'authentication-required',
         message: 'The page requires authentication.',
      };
      const model = buildReportModel(inventory, [
         { pageId: page.pageId, error: 'Missing audit.json' },
      ]);

      expect(model.pages[0]?.error).toStrictEqual('The page requires authentication.');
      expect(model.warnings).to.eql([`${page.pageId}: Missing audit.json`]);
   });
});

describe('report fix instruction boundaries', () => {
   it('keeps each element failure summary separate for the HTML and PDF renderers', () => {
      const report = buildAuditReport();
      const [violation] = report.axe.violations;
      if (!violation) {
         throw new Error('The fixture needs a violation.');
      }
      violation.nodes.push({
         target: ['button'],
         html: '<button></button>',
         failureSummary: 'Fix any of the following:\n  Give the button a name.',
      });
      const model = buildReportModel(buildReportTestInventory(), [
         { pageId: 'home-a1b2c3d4', report },
      ]);

      expect(model.pages[0]?.findings[0]?.guidance).toStrictEqual(
         'Increase the contrast ratio.\n\nFix any of the following:\n  Give the button a name.',
      );
      expect(model.discovery.scannedPages).toStrictEqual(1);
   });
});

describe('finding severity', () => {
   it('keeps unknown scanner impact unassessed instead of inventing minor severity', () => {
      const report = buildAuditReport();
      const violation = report.axe.violations[0];
      if (!violation) {
         throw new Error('The fixture needs a scanner violation.');
      }
      violation.impact = axeImpactSchema.parse(JSON.parse('null'));
      const model = buildReportModel(buildReportTestInventory(), [
         { pageId: 'home-a1b2c3d4', report },
      ]);

      expect(model.pages[0]?.findings[0]?.impact).toStrictEqual('unknown');
      expect(model.totals.violations.minor).toStrictEqual(0);
      expect(model.totals.outcomes.failed).toBeGreaterThan(0);
   });
});
