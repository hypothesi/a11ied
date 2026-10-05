import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { launchAutomationBrowser } from '../browser/policy.js';

/** Prints the self-contained HTML report to an A4 PDF. */
export async function renderPdfReport(
   html: string,
   outPath: string,
   documentPath = resolve(dirname(outPath), 'report.html'),
): Promise<void> {
   const launch = await launchAutomationBrowser(),
      page = await launch.browser.newPage();
   try {
      await mkdir(dirname(outPath), { recursive: true });
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.evaluate(
         (url) => {
            const base = document.createElement('base');
            base.href = url;
            document.head.prepend(base);
         },
         pathToFileURL(resolve(documentPath)).href,
      );
      await page.locator('details').evaluateAll((details) => {
         for (const detail of details) {
            detail.setAttribute('open', '');
         }
      });
      await page.pdf({
         path: outPath,
         format: 'A4',
         printBackground: true,
         outline: true,
         tagged: true,
         margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      });
   } finally {
      await page.close().catch(() => globalThis.undefined);
      await launch.browser.close().catch(() => globalThis.undefined);
   }
}
