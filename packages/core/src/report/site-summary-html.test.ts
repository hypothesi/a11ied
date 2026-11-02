import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildReportModel } from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { buildReportTestAudit, buildReportTestInventory } from './test-fixtures.js';

const SUMMARY_TILE_COUNT = 4,
   WCAG_AA_CRITERIA_FLOOR = 50;

function buildDocument(): Document {
   const report = buildReportTestAudit();
   report.axe.violations.push({
      id: 'button-name',
      impact: 'critical',
      description: 'Buttons need names',
      help: 'Buttons must have discernible text',
      helpUrl: 'https://example.test/button-name',
      tags: ['wcag412'],
      nodes: [
         { html: '<button></button>', target: ['button'], failureSummary: 'Fix it' },
      ],
   });
   const html = renderHtmlReport(
      buildReportModel(buildReportTestInventory(), [{ pageId: 'home-a1b2c3d4', report }]),
   );

   return new JSDOM(html).window.document;
}

describe('site summary', () => {
   it('opens with headline tiles and a collapsed list of distinct issues', () => {
      const document = buildDocument();

      expect(document.querySelectorAll('.tiles li')).toHaveLength(SUMMARY_TILE_COUNT);
      expect(
         document.querySelectorAll('#fix-first ~ details.issue, .issue').length,
      ).toBeGreaterThan(0);
      expect(document.querySelector('.issue')?.hasAttribute('open')).toStrictEqual(false);
   });

   it('lists every criterion under its WCAG principle', () => {
      const document = buildDocument(),
         principles = [...document.querySelectorAll('.principle h3')].map(
            (heading) => heading.textContent,
         );

      expect(principles).to.eql([
         '1. Perceivable',
         '2. Operable',
         '3. Understandable',
         '4. Robust',
      ]);
      expect(
         document.querySelectorAll('.principle tbody tr').length,
      ).toBeGreaterThanOrEqual(WCAG_AA_CRITERIA_FLOOR);
   });
});
