import { afterAll, beforeAll, describe, expect } from 'vitest';

import { createTestServer } from '../testing/fixtures.js';
import { screenReader, test } from './index.js';

/*
 * These fixtures need their scripts to run, so every reader here opens a URL and gets the
 * browser engine. The static counterparts live in screen-reader-structure.test.ts.
 */
const TIMEOUT_MS = 60_000;
const WAIT_TIMEOUT_MS = 5000;
const SHORT_WAIT_MS = 1500;

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

describe('three ways of showing the same message', () => {
   test(
      'waits for a message a live region announces after a delay',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('live-regions.html') });

         expect(sr.session.engine).toBe('browser');
         await sr.goTo({ role: 'button', name: 'Save draft' });
         await sr.activate();

         expect(await sr.wait({ for: /draft saved/iu, timeoutMs: WAIT_TIMEOUT_MS })).toBe(
            'polite: Draft saved to your workspace.',
         );
      },
      TIMEOUT_MS,
   );

   test(
      'reads an assertive region that announces during the click itself',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('live-regions.html') });

         await sr.goTo({ role: 'button', name: 'Delete account' });
         await sr.checkpoint('delete');
         await sr.activate();

         /*
          * An alert region announces while `activate` is still running, so the phrase is
          * already in the transcript by the time `wait` starts polling for new ones.
          */
         await sr.expectSpoken(/deletion could not be started/iu, { since: 'delete' });
         await expect(sr).toHaveSpoken(
            'assertive: Account deletion could not be started.',
         );
         await expect(
            sr.wait({ for: /deletion/iu, timeoutMs: SHORT_WAIT_MS }),
         ).rejects.toThrow(/was not announced within/u);
      },
      TIMEOUT_MS,
   );

   test(
      'says nothing when the message lands in a plain container',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('live-regions.html') });

         await sr.goTo({ role: 'button', name: 'Archive report' });
         await sr.checkpoint('archive');
         await sr.activate();

         await expect(
            sr.wait({ for: /archived/iu, timeoutMs: SHORT_WAIT_MS }),
         ).rejects.toThrow(/was not announced within/u);
         await expect(sr).not.toHaveSpoken('Report archived.', { since: 'archive' });
      },
      TIMEOUT_MS,
   );
});

describe('two dialogs opened from the same page', () => {
   test(
      'leaves the cursor on the trigger and lets Tab walk the page behind it',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('modal-untrapped.html') });

         await sr.goTo({ role: 'button', name: 'Rename workspace' });
         await sr.activate();

         await expect(sr).toHaveCursorOn({ role: 'button', name: 'Rename workspace' });
         expect(await sr.press('Tab')).toBe('button, Transfer workspace');
      },
      TIMEOUT_MS,
   );

   test(
      'moves the cursor into a native dialog and keeps Tab inside it',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('modal-untrapped.html') });

         await sr.goTo({ role: 'button', name: 'Transfer workspace' });
         await sr.activate();

         await expect(sr).toHaveCursorOn({ role: 'textbox', name: 'New owner' });
         expect(await sr.press('Tab')).toBe('button, Cancel');
      },
      TIMEOUT_MS,
   );

   test(
      'types into the dialog field and moves the session to another page',
      async () => {
         await using sr = await screenReader({ url: fixtureUrl('modal-untrapped.html') });

         await sr.goTo({ role: 'button', name: 'Transfer workspace' });
         await sr.activate();
         expect(await sr.type('Dana Whitfield')).toContain('Dana Whitfield');

         await sr.open(fixtureUrl('live-regions.html'));
         expect(await sr.title()).toBe('Notification demo');
         expect(await sr.next('heading')).toBe('heading, Notifications, level 1');
      },
      TIMEOUT_MS,
   );
});
