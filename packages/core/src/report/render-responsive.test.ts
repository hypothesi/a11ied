import { describe, expect, it } from 'vitest';
import { withLoadedPage } from '../browser/shared-browser.js';
import { buildReportModel } from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { buildReportTestAudit, buildReportTestInventory } from './test-fixtures.js';

const BROWSER_TIMEOUT_MS = 90_000;
const NARROW_VIEWPORT = { width: 390, height: 700 };

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
