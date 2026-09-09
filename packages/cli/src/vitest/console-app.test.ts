import { afterAll, beforeAll, describe, expect } from 'vitest';

import type { ScreenReader } from '../test/index.js';
import { createTestServer } from '../testing/fixtures.js';
import { screenReader, test } from './index.js';

/*
 * End to end runs through app/console.html, a client-side-routed support console. Routing
 * happens in the page, so `activate` never tears down the browsing context the way a real
 * navigation does. Loading it with ?announce=on turns on the route announcement the
 * default build leaves out.
 */
const TIMEOUT_MS = 60_000;
const EMAIL = 'dana@northwind.test';
const PASSWORD = 'correct horse';
const MAX_LANDMARKS = 6;

const testServer = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

function consoleUrl(query = ''): string {
   return `${testServer.getBaseUrl()}/app/console.html${query}`;
}

/** Fills the sign-in form and submits it, with a checkpoint on the submit itself. */
async function signIn(sr: ScreenReader, password = PASSWORD): Promise<void> {
   await sr.goTo({ role: 'textbox', name: 'Work email' });
   await sr.type(EMAIL);
   await sr.press('Tab');
   await sr.type(password);
   await sr.goTo({ role: 'button', name: 'Sign in' });
   await sr.checkpoint('submit');
   await sr.activate();
}

async function phrasesSince(sr: ScreenReader, label: string): Promise<string[]> {
   const entries = await sr.transcript({ since: label });

   return entries.map((entry) => entry.phrase);
}

/** Follows a ticket link and marks the transcript at the route change. */
async function openTicket(sr: ScreenReader, name: string): Promise<void> {
   await sr.goTo({ role: 'link', name });
   await sr.checkpoint('open ticket');
   await sr.activate();
}

async function headingFromTop(sr: ScreenReader): Promise<string> {
   await sr.top();
   return sr.next('heading');
}

describe('signing in to the console', () => {
   test(
      'sends a signed-out visitor asking for the queue back to the sign-in view',
      async () => {
         await using sr = await screenReader({ url: consoleUrl('#/queue') });

         expect(await headingFromTop(sr)).toBe('heading, Sign in, level 1');
         expect(await sr.elements('link', { max: 5 })).toEqual([]);
      },
      TIMEOUT_MS,
   );

   test(
      'says nothing about a rejected password and stays on the sign-in view',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr, 'the wrong one');

         expect(await phrasesSince(sr, 'submit')).toEqual([]);
         expect(await headingFromTop(sr)).toBe('heading, Sign in, level 1');
      },
      TIMEOUT_MS,
   );

   test(
      'reaches the queue on the right password and says nothing about the new view',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr);

         expect(await phrasesSince(sr, 'submit')).toEqual([]);
         expect(await headingFromTop(sr)).toBe('heading, Ticket queue, level 1');
      },
      TIMEOUT_MS,
   );

   test(
      'names the new view and moves the cursor there when the app announces routes',
      async () => {
         await using sr = await screenReader({ url: consoleUrl('?announce=on') });

         await signIn(sr);

         expect(await phrasesSince(sr, 'submit')).toEqual([
            'heading, Ticket queue, level 1',
            'polite: Ticket queue view',
         ]);
         await expect(sr).toHaveCursorOn({ name: 'Ticket queue view' });
      },
      TIMEOUT_MS,
   );
});

describe('working a ticket', () => {
   test(
      'lists the queue landmarks and opens a ticket without naming the new view',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr);
         const landmarks = await sr.elements('landmark', { max: MAX_LANDMARKS });

         expect(landmarks.map((item) => item.phrase)).toEqual([
            'banner',
            'navigation, Main',
            'main',
            'search',
         ]);

         await openTicket(sr, 'Seat count is wrong');

         expect(await sr.title()).toBe('Seat count is wrong | Support console');
         expect(await phrasesSince(sr, 'open ticket')).toEqual([]);
         expect(await headingFromTop(sr)).toBe('heading, Seat count is wrong, level 1');
      },
      TIMEOUT_MS,
   );
});

describe('replying to a ticket', () => {
   test(
      'announces the reply confirmation from a status region',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr);
         await openTicket(sr, 'Seat count is wrong');

         await sr.goTo({ role: 'textbox', name: 'Message' });
         await sr.type('We corrected the seat count.');
         await sr.goTo({ role: 'button', name: 'Send reply' });
         await sr.checkpoint('send');
         await sr.activate();

         await sr.expectSpoken('Reply sent. Status is now Waiting on customer.', {
            since: 'send',
         });
      },
      TIMEOUT_MS,
   );

   test(
      'refuses an empty reply and opens the escalate dialog without moving the cursor',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr);
         await sr.goTo({ role: 'link', name: 'Cannot export a report' });
         await sr.activate();

         await sr.goTo({ role: 'button', name: 'Send reply' });
         await sr.checkpoint('empty reply');
         await sr.activate();
         await sr.expectSpoken('Write a message before sending the reply.', {
            since: 'empty reply',
         });

         await sr.goTo({ role: 'button', name: 'Escalate' });
         await sr.checkpoint('escalate');
         await sr.activate();

         await expect(sr).toHaveCursorOn({ role: 'button', name: 'Escalate' });
         await expect(sr).not.toHaveSpoken(/escalate ticket/iu, { since: 'escalate' });
      },
      TIMEOUT_MS,
   );
});

describe('filtering the queue', () => {
   test(
      'leaves a filtered result count unannounced',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr);
         await sr.goTo({ role: 'combobox', name: 'Priority' });
         await sr.goTo({ role: 'button', name: 'Apply filters' });
         await sr.checkpoint('filter');
         await sr.activate();

         expect(await phrasesSince(sr, 'filter')).toEqual([]);
      },
      TIMEOUT_MS,
   );
});

describe('saving the profile', () => {
   test(
      'moves the cursor to the field it rejected and announces the save that worked',
      async () => {
         await using sr = await screenReader({ url: consoleUrl() });

         await signIn(sr);
         await sr.goTo({ role: 'link', name: 'Settings' });
         await sr.activate();
         expect(await headingFromTop(sr)).toBe('heading, Your profile, level 1');

         await sr.goTo({ role: 'button', name: 'Save profile' });
         await sr.activate();
         await expect(sr).toHaveCursorOn({ role: 'textbox', name: 'Display name' });
         expect(await sr.read()).toMatchObject({ states: ['required', 'invalid'] });

         await sr.type('Dana Whitfield');
         await sr.goTo({ role: 'button', name: 'Save profile' });
         await sr.checkpoint('save');
         await sr.activate();
         await sr.expectSpoken('Profile saved.', { since: 'save' });
      },
      TIMEOUT_MS,
   );
});
