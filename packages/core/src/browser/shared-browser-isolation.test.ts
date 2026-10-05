import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer } from '../../../cli/src/testing/fixtures.js';
import { withLoadedPage } from './shared-browser.js';

const server = createTestServer(),
   timeoutMs = 30_000;

beforeAll(async () => {
   await server.start();
});

afterAll(async () => {
   await server.stop();
});

describe('independent browser document ownership', () => {
   it(
      'loads the requested document after another callback navigates away',
      async () => {
         const load = {
            kind: 'goto',
            url: `${server.getBaseUrl()}/link-navigation.html`,
         } as const;
         await withLoadedPage(load, async (page) => {
            await page.goto(`${server.getBaseUrl()}/basic-page.html`);
         });
         await withLoadedPage(load, async (page) => {
            const title = await page.title();

            expect(page.url()).toBe(load.url);
            expect(title).toBe('Source page with link');
         });
      },
      timeoutMs,
   );

   it(
      'isolates same-URL mutations and authentication from later independent calls',
      async () => {
         const load = {
            kind: 'goto',
            url: `${server.getBaseUrl()}/link-navigation.html`,
         } as const;
         await withLoadedPage(load, async (page) => {
            await page
               .context()
               .addCookies([
                  { name: 'private-session', value: 'signed-in', url: load.url },
               ]);
            await page.evaluate(() => {
               sessionStorage.setItem('private-session', 'signed-in');
               document.title = 'Private dialog';
               document.body.innerHTML = '<h1>Private state</h1>';
            });
         });
         await withLoadedPage(load, async (page) => {
            const cookies = await page.context().cookies(),
               session = await page.evaluate(() =>
                  sessionStorage.getItem('private-session'),
               ),
               title = await page.title();

            expect(
               cookies.some((cookie) => cookie.name === 'private-session'),
            ).toStrictEqual(false);
            expect(session).toBeNull();
            expect(title).toBe('Source page with link');
            expect(await page.locator('a').count()).toBe(1);
         });
      },
      timeoutMs,
   );
});
