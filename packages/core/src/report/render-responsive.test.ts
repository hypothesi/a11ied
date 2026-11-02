import { describe, expect, it } from 'vitest';
import { withLoadedPage } from '../browser/shared-browser.js';
import { buildReportModel } from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { buildReportTestAudit, buildReportTestInventory } from './test-fixtures.js';

const BROWSER_TIMEOUT_MS = 90_000;
const NARROW_VIEWPORT = { width: 390, height: 700 };
const A4_VIEWPORT = { width: 794, height: 1123 };
const MIN_PRINT_COLUMN_PX = 80;
const RATIONALE_REPEATS = 40;
const RECORDED_COLUMN_COUNT = 3;
const LONG_RATIONALE = 'The control exposes no accessible name. '.repeat(
   RATIONALE_REPEATS,
);

describe('responsive report navigation', () => {
   it(
      'keeps narrow reports within the viewport and lets keyboard users open the contents menu',
      async () => {
         const model = buildReportModel(buildReportTestInventory(), [
            { pageId: 'home-a1b2c3d4', report: buildReportTestAudit() },
         ]);
         model.warnings.push(
            'https://example.test/a/very/long/path/that/must/wrap/within/the/viewport',
         );
         await withLoadedPage(
            { kind: 'html', html: renderHtmlReport(model) },
            async (page) => {
               await page.setViewportSize(NARROW_VIEWPORT);
               await page.waitForFunction(
                  () => !document.querySelector('.contents-menu')?.hasAttribute('open'),
               );
               const width = await page.evaluate(() => ({
                  viewport: innerWidth,
                  document: document.documentElement.scrollWidth,
               }));
               await page.locator('.contents-menu > summary').press('Enter');
               await page.waitForFunction(() =>
                  document.querySelector('.contents-menu')?.hasAttribute('open'),
               );
               await page.locator('#inventory').scrollIntoViewIfNeeded();
               await page.locator('.back-to-top').press('Enter');

               expect(width.document).toStrictEqual(width.viewport);
               expect(
                  await page.locator('.contents-menu').getAttribute('open'),
               ).not.toBeNull();
               expect(await page.evaluate(() => scrollY)).toStrictEqual(0);
            },
         );
      },
      BROWSER_TIMEOUT_MS,
   );
});

describe('printed report tables', () => {
   it(
      'keeps the test and outcome columns readable in print when the rationale is long',
      async () => {
         const report = buildReportTestAudit();
         report.recorded.push({
            subject: report.axe.url,
            test: {
               kind: 'criterion',
               criterionId: '4.1.2',
               procedureId: 'name_role_value_probe',
            },
            outcome: 'failed',
            mode: 'manual',
            recordedAt: new Date().toISOString(),
            note: LONG_RATIONALE,
         });
         const model = buildReportModel(buildReportTestInventory(), [
            { pageId: 'home-a1b2c3d4', report },
         ]);
         await withLoadedPage(
            { kind: 'html', html: renderHtmlReport(model) },
            async (page) => {
               await page.setViewportSize(A4_VIEWPORT);
               await page.emulateMedia({ media: 'print' });
               const widths = await page
                  .locator('.recorded-table thead th')
                  .evaluateAll((headers) =>
                     headers.map((header) => header.getBoundingClientRect().width),
                  );

               expect(widths).toHaveLength(RECORDED_COLUMN_COUNT);
               expect(Math.min(...widths)).toBeGreaterThan(MIN_PRINT_COLUMN_PX);
            },
         );
      },
      BROWSER_TIMEOUT_MS,
   );
});
