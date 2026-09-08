import { afterAll, beforeAll, describe, expect } from 'vitest';

import type { ScreenReader } from '../test/index.js';
import { createTestServer, readFixture } from '../testing/fixtures.js';
import { screenReader, ScreenReaderAssertionError, test } from './index.js';

/*
 * Every reader here opens a URL, so the driver runs against headless Chromium and reads
 * the same accessibility tree a browser builds. The scripted fixtures live in
 * screen-reader-interaction.test.ts; these four are static, so the reading is the subject.
 */
const TIMEOUT_MS = 60_000;
const MAX_ELEMENTS = 12;

const testServer = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

function fixtureUrl(path: string): string {
   return `${testServer.getBaseUrl()}/${path}`;
}

async function phrasesOf(
   items: Promise<Array<{ phrase?: string | undefined }>>,
): Promise<string[]> {
   const resolved = await items;

   return resolved.map((item) => item.phrase ?? '');
}

describe('a document whose heading outline skips levels', () => {
   test(
      'lists every heading in document order with its level',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('heading-outline.html') });

         expect(sr.session.engine).toBe('browser');
         expect(await sr.title()).toBe('Heading outline');
         expect(await phrasesOf(sr.elements('heading', { max: MAX_ELEMENTS }))).toEqual([
            'heading, Site sections, level 2',
            'heading, Release notes, level 1',
            'heading, Version 4.2, level 3',
            'heading, Fixed in 4.2, level 4',
            'heading, Version 4.1, level 2',
            'heading, level 3',
            'heading, Older releases, level 1',
         ]);
      },
      TIMEOUT_MS,
   );

   test(
      'jumps by level and back, and reports the empty heading with no name',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('heading-outline.html') });

         expect(await sr.next('heading', { level: 1 })).toBe(
            'heading, Release notes, level 1',
         );
         expect(await sr.next('heading', { level: 4 })).toBe(
            'heading, Fixed in 4.2, level 4',
         );
         expect(await sr.previous('heading')).toBe('heading, Version 4.2, level 3');

         await sr.goTo({ role: 'heading', name: 'Version 4.1' });
         expect(await sr.next('heading')).toBe('heading, level 3');
         expect(await sr.read()).toMatchObject({ role: 'heading', level: 3 });
         expect(await sr.read()).toBeOn({ role: 'heading' });
      },
      TIMEOUT_MS,
   );

   test(
      'reads the whole page from the top and records it in the transcript',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('heading-outline.html') });

         await sr.checkpoint('before walk');
         const items = await sr.walk();

         expect(items.length).toBeGreaterThan(MAX_ELEMENTS);
         await expect(sr).toHaveSpokenInOrder(
            ['Release notes', 'Version 4.2', 'Older releases'],
            { since: 'before walk' },
         );
      },
      TIMEOUT_MS,
   );
});

describe('a document with duplicate landmarks', () => {
   test(
      'lists both navigations and both mains',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('landmark-maze.html') });

         expect(await phrasesOf(sr.elements('landmark', { max: MAX_ELEMENTS }))).toEqual([
            'banner',
            'navigation',
            'navigation',
            'main',
            'region, Alerts',
            'main',
            'contentinfo',
         ]);
      },
      TIMEOUT_MS,
   );

   test(
      'counts only the named section as a region',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('landmark-maze.html') });

         expect(await phrasesOf(sr.elements('region', { max: MAX_ELEMENTS }))).toEqual([
            'region, Alerts',
         ]);
         expect(await sr.goTo({ role: 'region', name: 'Alerts' })).toBe('region, Alerts');
      },
      TIMEOUT_MS,
   );

   test(
      'moves to the end of the document and back to the top',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('landmark-maze.html') });

         await sr.bottom();
         expect(await sr.previous('heading')).toBe('heading, Second main, level 2');
         await sr.top();
         expect(await sr.next('heading')).toBe('heading, Dashboard, level 1');
      },
      TIMEOUT_MS,
   );
});

describe('ARIA widgets built with and without their state attributes', () => {
   test(
      'announces a button with no accessible name as its role alone',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('aria-widgets.html') });

         expect(await phrasesOf(sr.elements('button', { max: MAX_ELEMENTS }))).toEqual([
            'button',
            'button, Delete draft',
            'button, Export report',
            'button, Mute alerts, not pressed',
            'button, Email digest, not pressed',
         ]);
      },
      TIMEOUT_MS,
   );

   test(
      'fills in a checkbox state the markup never set',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('aria-widgets.html') });
         const controls = await phrasesOf(sr.elements('control', { max: MAX_ELEMENTS }));

         expect(controls).toContain('checkbox, Send release notes, not checked');
         expect(controls).toContain('checkbox, Send incident reports, not checked');
         expect(controls).toContain(
            'tab, Overview, not selected, position 1, set size 2',
         );
      },
      TIMEOUT_MS,
   );

   test(
      'gives a field with a dangling aria-labelledby no name at all',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('aria-widgets.html') });

         expect(
            await phrasesOf(sr.elements('form-field', { max: MAX_ELEMENTS })),
         ).toEqual(['textbox', 'textbox, Report title']);

         await sr.goTo({ role: 'textbox', name: 'Report title' });
         await expect(sr).toBeOn({ role: 'textbox', name: 'Report title' });
         await expect(sr).not.toBeOn({ role: 'button' });
      },
      TIMEOUT_MS,
   );
});

describe('a form whose fields carry their errors and states', () => {
   test(
      'announces a placeholder as a placeholder and not as a name',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('form-errors.html') });

         expect(await sr.next('form-field')).toBe('textbox, placeholder Team name');
         const item = await sr.read();

         expect(item.role).toBe('textbox');
         expect(item.name).toBeUndefined();
         expect(item.states).toEqual([]);
      },
      TIMEOUT_MS,
   );

   test(
      'announces the linked error text with the invalid and required states',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('form-errors.html') });

         expect(await sr.goTo({ role: 'textbox', name: 'Work email' })).toBe(
            'textbox, Work email, Enter an address on your company domain., invalid, required',
         );
         expect(await sr.read()).toMatchObject({
            name: 'Work email',
            states: ['required', 'invalid'],
         });
      },
      TIMEOUT_MS,
   );

   test(
      'moves the cursor to text anywhere on the page',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('form-errors.html') });

         expect(await sr.find('Billing period')).toContain('Billing period');
         await expect(sr).toHaveSpoken(/billing period/iu);
      },
      TIMEOUT_MS,
   );
});

describe('a request the page cannot satisfy', () => {
   test(
      'throws a ScreenReaderAssertionError naming what it wanted',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('form-errors.html') });

         await expect(sr.goTo({ role: 'button', name: 'Delete' })).rejects.toThrow(
            ScreenReaderAssertionError,
         );
         await expect(sr.find('a phrase that is not here')).rejects.toThrow(
            /is not on the page/u,
         );
         await expect(sr.expectSpoken('Delete account')).rejects.toThrow(
            /was not announced in the transcript/u,
         );
      },
      TIMEOUT_MS,
   );
});

describe('the reader lifecycle', () => {
   test(
      'disposes at the end of a block and refuses to run afterwards',
      async () => {
         const disposed = await (async (): Promise<ScreenReader> => {
            await using sr = await screenReader({
               url: fixtureUrl('heading-outline.html'),
            });

            expect(sr.session).toMatchObject({ sr: 'virtual', engine: 'browser' });
            return sr;
         })();

         await expect(disposed.next('heading')).rejects.toThrow(/was stopped/u);
         await expect(disposed.stop()).resolves.toBeUndefined();
      },
      TIMEOUT_MS,
   );

   test(
      'reads the same outline from markup in jsdom as from the page in a browser',
      async () => {
         await using inBrowser = await screenReader({
            url: fixtureUrl('heading-outline.html'),
         });
         await using inJsdom = await screenReader({
            html: readFixture('heading-outline.html'),
         });

         expect(inJsdom.session.engine).toBe('jsdom');
         expect(
            await phrasesOf(inJsdom.elements('heading', { max: MAX_ELEMENTS })),
         ).toEqual(await phrasesOf(inBrowser.elements('heading', { max: MAX_ELEMENTS })));
      },
      TIMEOUT_MS,
   );
});
