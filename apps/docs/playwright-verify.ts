import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = 'http://localhost:4321';
const PAGES = [
   '/',
   '/workflows',
   '/cli-reference',
   '/criterion-lookup',
   '/wcag-data-sources',
   '/applicability',
   '/verification-semantics',
   '/driver-usage',
   '/pattern-execution',
   '/storybook-usage',
   '/recording-sessions',
   '/mcp-usage',
   '/api-reference',
   '/release-checklist',
];

const BAD_PATTERNS = [
   /not just .+?, but/i,
   /not a separate product/i,
   /reverse-engineer/i,
   /operator ladder/i,
   /honesty rule/i,
   /field rule/i,
   /plenty of tools get mushy/i,
   /the story a prettier shell/i,
   /this site should read like/i,
   /not when they ask you/i,
];

const SCREENSHOT_DIR = path.resolve(import.meta.dirname, '../../output/docs-screenshots');

async function main() {
   fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

   const browser = await chromium.launch();
   const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
   let failures = 0;

   for (const route of PAGES) {
      const page = await context.newPage();
      const url = `${BASE}${route}`;
      console.log(`\nChecking ${url}...`);

      const response = await page.goto(url, { waitUntil: 'networkidle' });
      if (!response || response.status() !== 200) {
         console.error(`  ✗ HTTP ${response?.status() ?? 'no response'}`);
         failures++;
         await page.close();
         continue;
      }
      console.log(`  ✓ HTTP 200`);

      // Screenshot
      const slug = route === '/' ? 'index' : route.replace(/^\//, '');
      await page.screenshot({
         path: path.join(SCREENSHOT_DIR, `${slug}.png`),
         fullPage: true,
      });
      console.log(`  ✓ Screenshot saved`);

      // Check for bad patterns in visible text
      const bodyText = await page.textContent('body');
      if (bodyText) {
         for (const pattern of BAD_PATTERNS) {
            if (pattern.test(bodyText)) {
               console.error(`  ✗ Bad pattern found: ${pattern}`);
               failures++;
            }
         }
      }

      // Check no broken links (internal only)
      const links = await page.$$eval('a[href^="/"]', (anchors) =>
         anchors
            .map((a) => (a as HTMLAnchorElement).getAttribute('href'))
            .filter(Boolean),
      );
      for (const href of links) {
         const linkUrl = href!.split('#')[0];
         if (linkUrl && !PAGES.includes(linkUrl)) {
            console.error(`  ✗ Broken internal link: ${href}`);
            failures++;
         }
      }

      // Check no empty sections
      const emptySections = await page.$$eval(
         'section',
         (sections) =>
            sections.filter((s) => (s.textContent?.trim().length ?? 0) < 10).length,
      );
      if (emptySections > 0) {
         console.error(`  ✗ ${emptySections} empty section(s)`);
         failures++;
      }

      // Check title exists
      const h1 = await page.$('h1');
      if (!h1) {
         console.error(`  ✗ No h1 found`);
         failures++;
      } else {
         const h1Text = await h1.textContent();
         console.log(`  ✓ h1: "${h1Text?.trim()}"`);
      }

      // Mobile viewport check
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(300);
      await page.screenshot({
         path: path.join(SCREENSHOT_DIR, `${slug}-mobile.png`),
         fullPage: true,
      });

      // Check mobile nav drawer exists
      if (route === '/') {
         const mobileBar = await page.$('.mobile-bar');
         if (!mobileBar) {
            console.error(`  ✗ Mobile bar not found`);
            failures++;
         } else {
            console.log(`  ✓ Mobile bar present`);
         }
      }

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.close();
   }

   await browser.close();

   console.log(`\n${'='.repeat(40)}`);
   if (failures === 0) {
      console.log('All checks passed ✓');
   } else {
      console.log(`${failures} failure(s) found ✗`);
   }
   process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
   console.error(error);
   process.exit(1);
});
