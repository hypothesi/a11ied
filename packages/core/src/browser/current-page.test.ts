import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { createTestServer, readFixture } from '../../../cli/src/testing/fixtures.js';
import { buildAuditReport } from '../audit/runtime.js';
import { runAxe } from '../axe/runtime.js';
import { getAccessibilityTree, getPageHtml, getPageTitle } from '../tree/runtime.js';
import { hasPageSetup } from './page-setup.js';
import { withInteractiveBrowserPage, withLoadedPage } from './shared-browser.js';
import { screenReader } from '../driver/screen-reader-node.js';

const server = createTestServer(),
   timeoutMs = 30_000;
beforeAll(async () => {
   await server.start();
});
afterAll(async () => {
   await server.stop();
});

async function assertOneReportVisit(): Promise<void> {
   let visits = 0;
   function recordVisit(request: { url?: string }): void {
      if (request.url === '/dialog.html') {
         visits += 1;
      }
   }
   server.server.on('request', recordVisit);
   try {
      const url = `${server.getBaseUrl()}/dialog.html`;
      const report = await buildAuditReport({
         load: { kind: 'goto', url },
         target: { kind: 'url', value: url },
         readHtml: async () => readFixture('dialog.html'),
         metadata: {},
         userHints: [],
         wcagVersion: '2.2',
         click: '#open-dialog',
         cookies: [],
      });

      expect(visits).toBe(1);
      expect(report.tree.roles).toContain('dialog');
      expect(report.axe.url).toBe(url);
   } finally {
      server.server.off('request', recordVisit);
   }
}

async function assertCurrentReader(page: Page): Promise<void> {
   const sr = await screenReader({ page });
   try {
      expect(sr.session).toMatchObject({ engine: 'browser', url: page.url() });
      expect(await sr.goTo({ role: 'button', name: 'Updated action' })).toContain(
         'Updated action',
      );
      await expect(screenReader({ page })).rejects.toMatchObject({
         code: 'virtual-session-conflict',
      });
      await expect(
         sr.open({ url: 'https://createdbyfireside.com/' }),
      ).rejects.toMatchObject({ code: 'browser-page-target-mismatch' });
   } finally {
      await sr.stop();
   }
   expect(page.isClosed()).toBe(false);
   await using restarted = await screenReader({ page });
   expect(await restarted.goTo({ role: 'button', name: 'Updated action' })).toContain(
      'Updated action',
   );
}

async function assertFreshAuthenticatedState(): Promise<void> {
   const load = {
      kind: 'goto',
      url: `${server.getBaseUrl()}/button-name-failure.html`,
   } as const;
   await withLoadedPage(load, async (page) => {
      const options = { page, wcagVersion: '2.2', ruleIds: ['button-name'] };
      await page
         .context()
         .addCookies([
            { name: 'fixture-session', value: 'local-fixture', url: load.url },
         ]);
      await page.evaluate(() => sessionStorage.setItem('fixture-state', 'retained'));
      const before = await runAxe(load, options);
      await page
         .locator('button')
         .evaluate((element) => element.setAttribute('aria-label', 'Updated action'));
      await assertCurrentReader(page);
      const after = await runAxe(load, options),
         cookies = await page.context().cookies(),
         html = await getPageHtml(load, { page }),
         screenshot = await page.screenshot(),
         stored = await page.evaluate(() => sessionStorage.getItem('fixture-state')),
         title = await getPageTitle(load, { page }),
         tree = await getAccessibilityTree(load, { page });

      expect(before.violations.map((rule) => rule.id)).toContain('button-name');
      expect(after.violations).to.eql([]);
      expect(tree.yaml).toContain('Updated action');
      expect(html).toContain('Updated action');
      expect(title).toBeTruthy();
      expect(screenshot.byteLength).toBeGreaterThan(0);
      expect(stored).toBe('retained');
      expect(cookies.some((cookie) => cookie.name === 'fixture-session')).toBe(true);
   });
}

describe('current browser observations', () => {
   it(
      'rejects overlapping axe scans before replacing the page engine',
      async () => {
         const load = {
            kind: 'goto',
            url: `${server.getBaseUrl()}/basic-page.html`,
         } as const;
         await withLoadedPage(load, async (page) => {
            const options = { page, wcagVersion: '2.2', ruleIds: ['button-name'] },
               results = await Promise.allSettled([
                  runAxe(load, options),
                  runAxe(load, options),
               ]);

            expect(results[0]).toMatchObject({ status: 'fulfilled' });
            expect(results[1]).toMatchObject({
               status: 'rejected',
               reason: { code: 'browser-scan-conflict' },
            });
            await expect(runAxe(load, options)).resolves.toHaveProperty('violations');
         });
      },
      timeoutMs,
   );
   it(
      'collects a dialog report with one visit and one setup action',
      assertOneReportVisit,
      timeoutMs,
   );
   it(
      'rescans the same URL and preserves local authenticated state across observations',
      assertFreshAuthenticatedState,
      timeoutMs,
   );
});

async function assertRejectedSetup(): Promise<void> {
   const load = { kind: 'html', html: '<h1>Current document</h1>' } as const;
   await withLoadedPage(load, async (page) => {
      await expect(
         getPageHtml({ kind: 'html', html: '<h1>Other source</h1>' }, { page }),
      ).rejects.toMatchObject({
         code: 'browser-page-target-mismatch',
      });
      await expect(
         getAccessibilityTree(
            { kind: 'goto', url: 'https://createdbyfireside.com/' },
            { page },
         ),
      ).rejects.toMatchObject({ code: 'browser-page-target-mismatch' });
      await expect(
         getPageHtml(load, { page, cookies: [], click: 'h1' }),
      ).rejects.toMatchObject({ code: 'browser-page-setup-conflict' });
      await expect(
         withInteractiveBrowserPage(
            'https://createdbyfireside.com/',
            async (current) => current.url(),
            { page },
         ),
      ).rejects.toMatchObject({ code: 'browser-page-target-mismatch' });
      await expect(screenReader({ page, mode: 'broker' })).rejects.toMatchObject({
         code: 'browser-reader-binding-conflict',
      });
      await expect(screenReader({ page, sr: 'voiceover' })).rejects.toMatchObject({
         code: 'browser-reader-binding-conflict',
      });
      await expect(screenReader({ page, engine: 'jsdom' })).rejects.toMatchObject({
         code: 'browser-reader-binding-conflict',
      });
      await expect(
         screenReader({ page, url: 'https://createdbyfireside.com/' }),
      ).rejects.toMatchObject({ code: 'browser-page-target-mismatch' });

      expect(await page.locator('h1').textContent()).toBe('Current document');
      expect(await page.evaluate(() => 'a11iedVirtualRuntime' in globalThis)).toBe(false);
   });
}

describe('current browser boundaries', () => {
   it('does not let an empty cookies array hide later setup options', () => {
      expect(hasPageSetup({ cookies: [], click: '#open-dialog' })).toBe(true);
      expect(hasPageSetup({ cookies: [], waitFor: '#ready' })).toBe(true);
   });
   it(
      'rejects target and setup changes instead of reloading the supplied page',
      assertRejectedSetup,
   );
   it('rejects a same-URL document reload during observation', async () => {
      const load = {
         kind: 'goto',
         url: `${server.getBaseUrl()}/basic-page.html`,
      } as const;
      await withLoadedPage(load, async (page) => {
         await expect(
            withLoadedPage(
               load,
               async (current) => {
                  await current.reload();
                  return current.title();
               },
               { page },
            ),
         ).rejects.toMatchObject({ code: 'browser-state-changed' });
      });
   });
});
