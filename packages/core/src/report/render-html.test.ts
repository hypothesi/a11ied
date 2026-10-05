import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildAuditReport } from '../audit/runtime.js';
import { buildReportModel } from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { buildReportTestAudit, buildReportTestInventory } from './test-fixtures.js';

const BROWSER_TEST_TIMEOUT_MS = 90_000;

const PAGE_TABLE_COUNT = 2;

describe('renderHtmlReport', () => {
   it('shows manual outcomes, evidence and coverage warnings in the offline report', () => {
      const inventory = buildReportTestInventory(),
         report = buildReportTestAudit();
      report.recorded.push({
         subject: report.axe.url,
         test: {
            kind: 'criterion',
            criterionId: '3.3.8',
            procedureId: 'auth_flow_probe',
         },
         outcome: 'failed',
         mode: 'manual',
         recordedAt: new Date().toISOString(),
         pointer: '#login',
         note: '<Missing password manager support>',
      });
      inventory.discovery.failures.push({
         source: inventory.startUrl,
         message: 'A page was unavailable.',
      });
      const html = renderHtmlReport(
         buildReportModel(inventory, [{ pageId: 'home-a1b2c3d4', report }]),
      );
      const document = new JSDOM(html).window.document;

      expect(document.body.textContent).toContain('auth_flow_probe');
      expect(document.body.textContent).toContain('<Missing password manager support>');
      expect(document.body.textContent).toContain('#login');
      expect(document.body.textContent).toContain('A page was unavailable.');
      expect(html).not.toContain('<Missing password manager support>');
      expect(document.querySelectorAll('caption')).toHaveLength(PAGE_TABLE_COUNT);
   });
});

describe('report markup accessibility', () => {
   it('renders semantic self-contained HTML and escapes model values', () => {
      const inventory = buildReportTestInventory();
      const page = inventory.pages[0];
      expect(page).toBeDefined();
      if (!page) {
         return;
      }
      page.title = '<Unsafe title>';
      const html = renderHtmlReport(buildReportModel(inventory, []));
      const document = new JSDOM(html).window.document;

      expect(document.querySelector('main')).not.toBeNull();
      expect(document.querySelector('table th[scope="col"]')).not.toBeNull();
      expect(html).toContain('&lt;Unsafe title&gt;');
      expect(html).not.toContain('<Unsafe title>');
   });

   it(
      'passes the in-process accessibility audit',
      async () => {
         const directory = await mkdtemp(resolve(tmpdir(), 'a11ied-report-audit-')),
            html = renderHtmlReport(buildReportModel(buildReportTestInventory(), [])),
            report = await buildAuditReport({
               load: { kind: 'html', html },
               readHtml: async () => html,
               target: { kind: 'html', value: html },
               metadata: {},
               userHints: [],
               wcagVersion: '2.2',
               evidenceFile: resolve(directory, 'evidence.jsonl'),
            });

         expect(report.axe.violations).toEqual([]);
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});
