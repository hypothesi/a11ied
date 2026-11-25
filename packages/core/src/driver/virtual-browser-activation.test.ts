import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { delay, type VirtualHost } from '@a11ied/guidepup';
import type { Page } from 'playwright';
import { createTestServer } from '../../../cli/src/testing/fixtures.js';
import { withLoadedPage } from '../browser/shared-browser.js';
import { createPlaywrightVirtualHost } from './virtual-playwright-host.js';

/** Long enough that the click returns well before the next document arrives. */
const SLOW_RESPONSE_MS = 750;

/** Drawn over the whole page, so a pointer click cannot land on anything beneath it. */
const COVER = '<div style="position: fixed; inset: 0"></div>';

const server = createTestServer(),
   timeoutMs = 30_000;

beforeAll(async () => {
   await server.start();
});

afterAll(async () => {
   await server.stop();
});

async function withReader(
   run: (page: Page, host: VirtualHost) => Promise<void>,
   html = '',
   fixture = 'link-navigation.html',
): Promise<void> {
   await withLoadedPage(
      { kind: 'goto', url: `${server.getBaseUrl()}/${fixture}` },
      async (page) => {
         if (html) {
            await page.setContent(html);
         }
         const host = await createPlaywrightVirtualHost(page);
         try {
            await host.start();
            await run(page, host);
         } finally {
            await host.dispose();
         }
      },
   );
}

/** Holds back the linked page the way a slow public server does. */
async function answerSlowly(page: Page): Promise<void> {
   await page.route('**/basic-page.html', async (route) => {
      await delay(SLOW_RESPONSE_MS);
      await route.continue();
   });
}

describe('browser virtual cursor activation', () => {
   it(
      'clicks the selected link once and observes the new document',
      async () => {
         await withReader(async (page, host) => {
            await page.evaluate(() => {
               document.querySelector('a')?.addEventListener('click', () => {
                  const count = Number(sessionStorage.getItem('activation-count') ?? '0');
                  sessionStorage.setItem('activation-count', String(count + 1));
               });
            });
            await host.navigate({ direction: 'next', kind: 'link' });
            const outcome = await host.runPortable('activate');
            const current = await host.readCurrentItem(),
               title = await host.readTitle();

            expect(outcome.moved).toStrictEqual(true);
            expect(page.url()).toBe(`${server.getBaseUrl()}/basic-page.html`);
            expect(title.title).toBe('Basic page');
            expect(
               await page.evaluate(() => sessionStorage.getItem('activation-count')),
            ).toBe('1');
            expect(current.item.role).toBe('document');
         });
      },
      timeoutMs,
   );

   it(
      'reads the new document when the server answers the link slowly',
      async () => {
         await withReader(async (page, host) => {
            await answerSlowly(page);
            await host.navigate({ direction: 'next', kind: 'link' });

            const outcome = await host.runPortable('activate'),
               title = await host.readTitle();

            expect(outcome.moved).toStrictEqual(true);
            expect(title.title).toBe('Basic page');
         });
      },
      timeoutMs,
   );

   it(
      'reads the content a client-side router swaps in after a slow fetch',
      async () => {
         await withReader(
            async (page, host) => {
               await answerSlowly(page);
               await host.navigate({ direction: 'next', kind: 'link' });

               const outcome = await host.runPortable('activate');
               const title = await host.readTitle();
               const heading = await host.navigate({
                     direction: 'next',
                     kind: 'heading',
                  }),
                  speech = await host.readSpeech();

               expect(outcome.moved).toStrictEqual(true);
               expect(title.title).toBe('Basic page');
               expect(heading.moved).toStrictEqual(true);
               expect(speech.lastSpokenPhrase).toBe(
                  'heading, Basic content page, level 1',
               );
            },
            '',
            'client-router.html',
         );
      },
      timeoutMs,
   );
});

describe('activation of a control that another element covers', () => {
   it(
      'follows a covered link the way a screen reader does',
      async () => {
         await withReader(async (_page, host) => {
            await host.navigate({ direction: 'next', kind: 'link' });

            const outcome = await host.runPortable('activate'),
               title = await host.readTitle();

            expect(outcome.moved).toStrictEqual(true);
            expect(title.title).toBe('Basic page');
         }, `<a href="/basic-page.html">Go to basic page</a>${COVER}`);
      },
      timeoutMs,
   );

   it(
      'presses a covered button once',
      async () => {
         await withReader(async (page, host) => {
            await host.navigate({ direction: 'next', kind: 'button' });

            await host.runPortable('activate');

            expect(await page.locator('button').getAttribute('data-presses')).toBe('1');
         }, `<button onclick="this.dataset.presses = String(Number(this.dataset.presses ?? 0) + 1)">Open</button>${COVER}`);
      },
      timeoutMs,
   );
});

describe('same-document virtual activation', () => {
   it(
      'keeps the exact cursor and reader log through duplicate buttons and hash navigation',
      async () => {
         await withReader(
            async (page, host) => {
               await host.navigate({ direction: 'next', kind: 'button', times: 2 });
               await host.runPortable('activate');

               expect(
                  await page.locator('button').nth(0).getAttribute('data-clicked'),
               ).toBeNull();
               expect(
                  await page.locator('button').nth(1).getAttribute('data-clicked'),
               ).toBe('yes');
               await host.navigate({ direction: 'next', kind: 'link' });
               const before = await host.readCurrentItem(),
                  speech = await host.readSpeech();
               await host.start();
               await host.runPortable('activate');
               const after = await host.readCurrentItem(),
                  spoken = await host.readSpeech();

               expect(page.url()).toContain('#step2');
               expect(after.position).toBe(before.position);
               expect(
                  spoken.spokenPhraseLog.slice(0, speech.spokenPhraseLog.length),
               ).to.eql(speech.spokenPhraseLog);
            },
            '<button onclick="this.dataset.clicked = \'yes\'">Open</button>' +
               '<button onclick="this.dataset.clicked = \'yes\'">Open</button>' +
               '<a href="#step2">Next step</a>',
         );
      },
      timeoutMs,
   );
});

describe('browser virtual cursor interaction safety', () => {
   it(
      'preserves same-document dialog interactions',
      async () => {
         await withReader(async (page, host) => {
            await host.navigate({ direction: 'next', kind: 'button' });
            await host.runPortable('activate');

            expect(await page.locator('dialog').isVisible()).toStrictEqual(true);
            const close = await host.findText('Close');

            expect(close.found).toStrictEqual(true);
            await host.runPortable('activate');

            expect(await page.locator('dialog').isVisible()).toStrictEqual(false);
         }, ['<button onclick="document.querySelector(\'dialog\').showModal()">Open</button>', '<dialog aria-label="Details"><button onclick="this.closest(\'dialog\').close()">Close</button></dialog>'].join(''));
      },
      timeoutMs,
   );

   it(
      'refuses a detached cursor node and keeps an absent cursor as a no-op',
      async () => {
         await withReader(async (page, host) => {
            await host.navigate({ direction: 'next', kind: 'link' });
            await page.evaluate(() => {
               const original = globalThis.a11iedVirtualRuntime.readActivationNode;
               globalThis.a11iedVirtualRuntime.readActivationNode = async (): Promise<
                  Element | undefined
               > => {
                  const node = await original();
                  node?.remove();
                  sessionStorage.setItem('detached-connected', String(node?.isConnected));
                  return node;
               };
            });

            await expect(host.runPortable('activate')).rejects.toThrow(
               /not attached|detached/iu,
            );
            expect(
               await page.evaluate(() => sessionStorage.getItem('detached-connected')),
            ).toBe('false');
            expect(page.url()).toContain('/link-navigation.html');
            await page.evaluate(() => {
               globalThis.a11iedVirtualRuntime.readActivationNode =
                  async (): Promise<undefined> => {
                     // An absent cursor must not activate a fallback element.
                  };
            });
            const absent = await host.runPortable('activate');

            expect(absent.moved).toStrictEqual(false);
            expect(page.url()).toContain('/link-navigation.html');
         });
      },
      timeoutMs,
   );
});
