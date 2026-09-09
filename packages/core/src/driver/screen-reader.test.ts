import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   cleanupTempRoots,
   createTestServer,
   withStateDir,
} from '../../../cli/src/testing/fixtures.js';
import {
   getActiveDriverSession,
   screenReader,
   ScreenReaderAssertionError,
} from '../index.js';

const TIMEOUT_MS = 60_000;
const PROCESS_EXIT_POLL_MS = 100;
const PROCESS_EXIT_TIMEOUT_MS = 10_000;
const tempRoots: string[] = [];
const testServer = createTestServer();

const SIGN_UP_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Sign up</title></head>
  <body>
    <main>
      <h1>Sign up</h1>
      <p>Create an account to continue.</p>
      <label>Email <input type="email" name="email" required /></label>
      <button type="submit">Create account</button>
    </main>
  </body>
</html>
`;

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

function isProcessRunning(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch {
      return false;
   }
}

async function waitForExit(pid: number, startedAt = Date.now()): Promise<boolean> {
   if (!isProcessRunning(pid)) {
      return true;
   }
   if (Date.now() - startedAt >= PROCESS_EXIT_TIMEOUT_MS) {
      return false;
   }
   await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, PROCESS_EXIT_POLL_MS);
   });
   return waitForExit(pid, startedAt);
}

async function assertInlineHtmlSession(): Promise<void> {
   await using sr = await screenReader({ html: SIGN_UP_HTML });

   expect(sr.session).toMatchObject({
      sr: 'virtual',
      mode: 'in-process',
      engine: 'jsdom',
   });
   expect(await sr.title()).toBe('Sign up');
   expect(await sr.next('heading')).toBe('heading, Sign up, level 1');
   expect(await sr.read()).toMatchObject({ role: 'heading', name: 'Sign up', level: 1 });
   expect(await sr.goTo({ role: 'textbox', name: 'Email' })).toBe(
      'textbox, Email, required',
   );
   expect(await sr.read()).toMatchObject({ role: 'textbox', states: ['required'] });
   expect(await sr.next('button')).toBe('button, Create account');

   await sr.checkpoint('before the rotor');
   const buttons = await sr.elements('button');
   expect(buttons.map((item) => item.name)).toEqual(['Create account']);
   await sr.expectSpoken('Create account', { since: 'before the rotor' });
   await sr.expectSpoken(/nowhere/u, { not: true });
   const walked = await sr.walk();
   expect(walked.map((item) => item.phrase)).toContain('paragraph');
}

async function assertExpectSpokenFailure(): Promise<void> {
   await using sr = await screenReader({ html: SIGN_UP_HTML });
   await sr.next('heading');

   const failure = await sr
      .expectSpoken('Pay now, button')
      .catch((error: unknown) => error);

   expect(failure).toBeInstanceOf(ScreenReaderAssertionError);
   if (!(failure instanceof ScreenReaderAssertionError)) {
      return;
   }
   expect(failure.message).toContain(
      '"Pay now, button" was not announced in the transcript',
   );
   expect(failure.message).toMatch(/\(\d+ phrases checked\)/u);
   expect(failure.message).toContain('"heading, Sign up, level 1"');
   expect(failure.expected).toBe('"Pay now, button"');
   expect(failure.phrases).toContain('heading, Sign up, level 1');
}

async function assertCursorAndOrderChecks(): Promise<void> {
   await using sr = await screenReader({ html: SIGN_UP_HTML });
   await sr.next('heading');
   await sr.next('button');

   await sr.expectCursorOn({ role: 'button', name: 'Create account' });
   await sr.expectSpokenInOrder(['Sign up', 'Create account']);
   const onFailure = await sr
         .expectCursorOn({ role: 'link' })
         .catch((error: unknown) => error),
      orderFailure = await sr
         .expectSpokenInOrder(['Create account', 'Sign up'])
         .catch((error: unknown) => error);

   expect(onFailure).toBeInstanceOf(ScreenReaderAssertionError);
   expect(onFailure).toMatchObject({
      expected: 'link',
      message: expect.stringContaining('role "link"'),
   });
   expect(orderFailure).toBeInstanceOf(ScreenReaderAssertionError);
   expect(orderFailure).toMatchObject({
      expected: '"Create account", then "Sign up"',
      message: expect.stringContaining('was not announced after'),
      phrases: expect.arrayContaining(['button, Create account']),
   });
}

async function assertDisposalStopsInProcess(): Promise<void> {
   const sr = await screenReader({ html: SIGN_UP_HTML });
   await sr.next();
   await sr[Symbol.asyncDispose]();

   await expect(sr.next()).rejects.toMatchObject({ code: 'session-stopped' });
   await sr.stop();
}

async function assertBrowserEngineRunsPageScripts(): Promise<void> {
   await using sr = await screenReader({ url: `${testServer.getBaseUrl()}/dialog.html` });

   expect(sr.session.engine).toBe('browser');
   expect(sr.session.url).toContain('/dialog.html');
   await sr.goTo({ role: 'button', name: 'Open dialog' });
   await sr.checkpoint('opened');
   await sr.activate();
   await sr.expectSpoken('dialog, Preferences', { since: 'opened' });
   await sr.escape();
   await sr.expectSpoken('button, Open dialog', { since: 'opened' });
}

async function assertBrokerDisposalLeavesNoProcess(): Promise<void> {
   const sr = await screenReader({
      mode: 'broker',
      html: SIGN_UP_HTML,
      idleTimeoutMinutes: 1,
   });
   const active = await getActiveDriverSession();
   expect(active?.target).toBe('virtual');
   expect(sr.session.mode).toBe('broker');
   expect(await sr.next('heading')).toBe('heading, Sign up, level 1');

   await sr[Symbol.asyncDispose]();

   expect(await getActiveDriverSession()).toBeUndefined();
   expect(active).toBeDefined();
   expect(await waitForExit(active?.brokerPid ?? 0)).toBe(true);
}

describe('screenReader in process', () => {
   it(
      'drives inline HTML in jsdom and disposes with await using',
      () => withStateDir(tempRoots, assertInlineHtmlSession),
      TIMEOUT_MS,
   );

   it(
      'names what was expected, how many phrases were checked, and what was said',
      () => withStateDir(tempRoots, assertExpectSpokenFailure),
      TIMEOUT_MS,
   );

   it(
      'checks the cursor and the order of announcements',
      () => withStateDir(tempRoots, assertCursorAndOrderChecks),
      TIMEOUT_MS,
   );

   it(
      'refuses every call after disposal',
      () => withStateDir(tempRoots, assertDisposalStopsInProcess),
      TIMEOUT_MS,
   );

   it(
      'runs a URL in the browser engine, where a click opens the dialog',
      () => withStateDir(tempRoots, assertBrowserEngineRunsPageScripts),
      TIMEOUT_MS,
   );

   it('rejects a URL and inline HTML together', async () => {
      await expect(
         screenReader({ url: 'http://localhost/', html: '<p>x</p>' }),
      ).rejects.toMatchObject({
         code: 'validation-error',
      });
   });
});

describe('screenReader with the broker', () => {
   it(
      'stops the session on disposal and leaves no broker process behind',
      () => withStateDir(tempRoots, assertBrokerDisposalLeavesNoProcess),
      TIMEOUT_MS,
   );
});

describe('checks that wait', () => {
   const SHORT_TIMEOUT_MS = 300;
   const LONG_ENOUGH_MS = 2000;

   it(
      'passes when the announcement lands while the check is waiting',
      async () => {
         await using sr = await screenReader({ html: SIGN_UP_HTML });

         const waiting = sr.expectSpoken('Create account');
         await sr.next('button');

         await expect(waiting).resolves.toBeUndefined();
      },
      TIMEOUT_MS,
   );

   it(
      'says how long it waited when the phrase never lands',
      async () => {
         await using sr = await screenReader({ html: SIGN_UP_HTML });
         const started = Date.now();

         await expect(
            sr.expectSpoken('Refund', { timeoutMs: SHORT_TIMEOUT_MS }),
         ).rejects.toThrow(`Waited ${String(SHORT_TIMEOUT_MS)} ms.`);
         expect(Date.now() - started).toBeGreaterThanOrEqual(SHORT_TIMEOUT_MS);
      },
      TIMEOUT_MS,
   );

   it(
      'does not wait for a phrase that must be absent, or when told to check once',
      async () => {
         await using sr = await screenReader({ html: SIGN_UP_HTML });
         const started = Date.now();

         await sr.expectSpoken('Refund', { not: true });
         await expect(sr.expectSpoken('Refund', { timeoutMs: 0 })).rejects.toThrow(
            ScreenReaderAssertionError,
         );

         expect(Date.now() - started).toBeLessThan(LONG_ENOUGH_MS);
      },
      TIMEOUT_MS,
   );
});
