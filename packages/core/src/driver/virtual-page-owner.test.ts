import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestServer } from '../../../cli/src/testing/fixtures.js';
import { withLoadedPage } from '../browser/shared-browser.js';
import { runAxe } from '../axe/runtime.js';
import { createPlaywrightVirtualHost } from './virtual-playwright-host.js';
import { screenReader } from './screen-reader-node.js';
import * as choices from './virtual-host-choice.js';

const server = createTestServer(),
   timeoutMs = 30_000;
beforeAll(async () => {
   await server.start();
});
afterAll(async () => {
   await server.stop();
});

async function assertStrictCSP(): Promise<void> {
   const load = { kind: 'goto', url: `${server.getBaseUrl()}/strict-csp.html` } as const;
   await withLoadedPage(load, async (page) => {
      const host = await createPlaywrightVirtualHost(page);
      await host.start();
      const moved = await host.runPortable('next');

      expect(moved.moved).toBe(true);
      const scan = await runAxe(load, {
         page,
         wcagVersion: '2.2',
         ruleIds: ['button-name'],
      });
      expect(scan.violations).to.eql([]);
      await host.dispose();
      await page.reload();
      expect(await page.evaluate(() => 'a11iedVirtualRuntime' in globalThis)).toBe(false);
   });
}

async function assertStartupRecovery(): Promise<void> {
   const load = { kind: 'goto', url: `${server.getBaseUrl()}/basic-page.html` } as const;
   await withLoadedPage(load, async (page) => {
      const host = await createPlaywrightVirtualHost(page);
      await page.reload();
      await expect(host.start()).rejects.toMatchObject({ code: 'browser-state-changed' });
      expect(await page.evaluate(() => 'a11iedVirtualRuntime' in globalThis)).toBe(false);
      await host.dispose();
      const failed = await createPlaywrightVirtualHost(page);
      vi.spyOn(page, 'evaluate').mockRejectedValueOnce(
         new Error('Injection unavailable'),
      );
      await expect(failed.start()).rejects.toThrow('Injection unavailable');
      await failed.dispose();
      await using sr = await screenReader({ page });
      expect(await sr.next('heading')).toContain('heading');
   });
}

async function assertStopRecovery(): Promise<void> {
   const load = { kind: 'goto', url: `${server.getBaseUrl()}/basic-page.html` } as const;
   await withLoadedPage(load, async (page) => {
      const host = await createPlaywrightVirtualHost(page);
      await host.start();
      await page.evaluate(() => {
         const original = globalThis.a11iedVirtualRuntime.stop;
         let fail = true;
         globalThis.a11iedVirtualRuntime.stop = async (): Promise<void> => {
            if (fail) {
               fail = false;
               throw new Error('Reader cleanup failed');
            }
            await original();
         };
      });
      await expect(host.dispose()).rejects.toThrow('Reader cleanup failed');
      await expect(createPlaywrightVirtualHost(page)).rejects.toMatchObject({
         code: 'virtual-session-conflict',
      });
      await Promise.all([host.dispose(), host.dispose()]);
      const next = await createPlaywrightVirtualHost(page);
      try {
         await next.start();
         await host.dispose();
         await expect(host.readSpeech()).rejects.toMatchObject({
            code: 'virtual-session-not-started',
         });
         const current = await next.readCurrentItem();

         expect(current.item).toBeDefined();
      } finally {
         await next.dispose();
      }
      expect(page.isClosed()).toBe(false);
   });
}

async function assertWholeStartupGuard(): Promise<void> {
   const load = { kind: 'goto', url: `${server.getBaseUrl()}/basic-page.html` } as const;
   await withLoadedPage(load, async (page) => {
      const host = await createPlaywrightVirtualHost(page);
      let reloaded = false;
      const choice = vi.spyOn(choices, 'createVirtualHost').mockResolvedValueOnce({
         ...host,
         async attachDocument(document): Promise<void> {
            await host.attachDocument(document);
            if (!reloaded) {
               reloaded = true;
               await page.reload();
            }
         },
      });
      try {
         await expect(screenReader({ page })).rejects.toMatchObject({
            code: 'browser-state-changed',
         });
      } finally {
         choice.mockRestore();
         await host.dispose();
      }
      await using healthy = await screenReader({ page });

      expect(await healthy.next('heading')).toContain('heading');
   });
}

async function assertSnapshotGuard(): Promise<void> {
   const load = { kind: 'goto', url: `${server.getBaseUrl()}/basic-page.html` } as const;
   await withLoadedPage(load, async (page) => {
      const host = await createPlaywrightVirtualHost(page);
      await host.start();
      try {
         if (!host.readSnapshot) {
            throw new Error('Browser host must expose a document snapshot.');
         }
         await page.evaluate(() => {
            globalThis.a11iedVirtualRuntime.readCurrentItem =
               async (): Promise<never> => {
                  location.reload();
                  return new Promise<never>(() => {
                     // Navigation destroys this evaluation.
                  });
               };
         });

         await expect(host.readSnapshot()).rejects.toMatchObject({
            code: 'browser-state-changed',
         });
      } finally {
         await host.dispose();
      }
   });
}

async function assertNavigationDuringFind(): Promise<void> {
   const load = { kind: 'goto', url: `${server.getBaseUrl()}/basic-page.html` } as const;
   await withLoadedPage(load, async (page) => {
      const host = await createPlaywrightVirtualHost(page);
      await host.start();
      try {
         await page.evaluate(() => {
            globalThis.a11iedVirtualRuntime.findText = async (): Promise<never> => {
               location.reload();
               return new Promise<never>(() => {
                  // Navigation destroys this evaluation.
               });
            };
         });

         await expect(host.findText('Basic content page')).rejects.toMatchObject({
            code: 'browser-state-changed',
         });
      } finally {
         await host.dispose();
      }
   });
}

describe('borrowed browser document snapshots', () => {
   it(
      'rejects navigation during find instead of replaying the cursor action',
      assertNavigationDuringFind,
      timeoutMs,
   );
   it(
      'recovers title, find, and table commands immediately after caller navigation',
      async () => {
         const load = {
            kind: 'goto',
            url: `${server.getBaseUrl()}/basic-page.html`,
         } as const;
         await withLoadedPage(load, async (page) => {
            const host = await createPlaywrightVirtualHost(page);
            await host.start();
            try {
               await page.reload();
               expect(await host.readTitle()).toMatchObject({ title: 'Basic page' });
               await page.reload();
               expect(await host.findText('Basic content page')).toMatchObject({
                  found: true,
               });
               await page.reload();
               await expect(host.moveInTable('next-cell')).rejects.toMatchObject({
                  code: 'driver-not-in-table',
               });
            } finally {
               await host.dispose();
            }
         });
      },
      timeoutMs,
   );
   it(
      'rejects same-URL reloads between startup, attachment, and initial state',
      assertWholeStartupGuard,
      timeoutMs,
   );
   it(
      'rejects a reload while collecting related speech and cursor observations',
      assertSnapshotGuard,
      timeoutMs,
   );
});

describe('borrowed browser reader ownership', () => {
   it(
      'propagates recovery startup failures and releases destroyed document runtimes',
      async () => {
         const load = {
            kind: 'goto',
            url: `${server.getBaseUrl()}/basic-page.html`,
         } as const;
         await withLoadedPage(load, async (page) => {
            const host = await createPlaywrightVirtualHost(page);
            await host.start();
            const evaluation = vi.spyOn(page, 'evaluate');
            evaluation
               .mockResolvedValueOnce(false)
               .mockResolvedValueOnce(false)
               .mockRejectedValueOnce(new Error('Recovery failed'));
            try {
               await expect(host.readSpeech()).rejects.toThrow('Recovery failed');
            } finally {
               evaluation.mockRestore();
            }
            await page.reload();
            await host.dispose();
            await using sr = await screenReader({ page });

            expect(await sr.next('heading')).toContain('heading');
         });
      },
      timeoutMs,
   );
   it(
      'supports strict CSP and leaves no reader init script after disposal',
      assertStrictCSP,
      timeoutMs,
   );
   it(
      'rejects startup document changes and releases failed uninitialized hosts',
      assertStartupRecovery,
      timeoutMs,
   );
   it(
      'retains failed cleanup for retry and rejects stale host methods',
      assertStopRecovery,
      timeoutMs,
   );
});
