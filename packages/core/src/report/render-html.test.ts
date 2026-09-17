import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildAuditReport } from '../audit/runtime.js';
import { buildReportModel } from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { buildReportTestInventory } from './test-fixtures.js';

const BROWSER_TEST_TIMEOUT_MS = 90_000;

describe('renderHtmlReport', () => {
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
