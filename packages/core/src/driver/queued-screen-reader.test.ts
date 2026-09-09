import { describe, expect, it } from 'vitest';

import {
   queuedScreenReader,
   queueScreenReader,
   screenReader,
   ScreenReader,
   ScreenReaderAssertionError,
   type CommandQueueOptions,
} from '../index.js';

const TIMEOUT_MS = 30_000;

const CHECKOUT_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Checkout</title></head>
  <body>
    <main>
      <h1>Checkout</h1>
      <p>Two items in your cart.</p>
      <button type="button">Pay now</button>
    </main>
  </body>
</html>
`;

async function failureOf(queued: PromiseLike<unknown>): Promise<unknown> {
   try {
      await queued;
      return undefined;
   } catch (error) {
      return error;
   }
}

const PUBLIC_METHODS = [
   'activate',
   'bottom',
   'checkpoint',
   'elements',
   'escape',
   'expectOn',
   'expectSpoken',
   'expectSpokenInOrder',
   'find',
   'focus',
   'goTo',
   'interact',
   'next',
   'open',
   'perform',
   'press',
   'previous',
   'read',
   'readAll',
   'screenshot',
   'state',
   'stopInteracting',
   'table',
   'title',
   'top',
   'transcript',
   'type',
   'wait',
   'walk',
] as const;

function collecting(settled: Promise<void>[]): CommandQueueOptions {
   return {
      track: (promise): void => {
         settled.push(promise);
      },
   };
}

describe('queuedScreenReader', () => {
   it(
      'runs queued commands in order and awaits only the call that needs a value',
      async () => {
         await using sr = await queuedScreenReader({ html: CHECKOUT_HTML });

         expect(sr.session).toMatchObject({
            sr: 'virtual',
            mode: 'in-process',
            engine: 'jsdom',
         });
         sr.next('heading');
         sr.checkpoint('after heading');
         sr.next('button');
         sr.expectSpoken('Pay now', { since: 'after heading' });
         sr.expectOn({ role: 'button', name: 'Pay now' });
         sr.expectSpokenInOrder(['Checkout', 'Pay now']);

         expect(await sr.read()).toMatchObject({ role: 'button', name: 'Pay now' });
      },
      TIMEOUT_MS,
   );

   it(
      'exposes every method of ScreenReader except stop',
      async () => {
         await using sr = await queuedScreenReader({ html: CHECKOUT_HTML });

         for (const name of PUBLIC_METHODS) {
            expect(ScreenReader.prototype).toHaveProperty(name, expect.any(Function));
            expect(sr).toHaveProperty(name, expect.any(Function));
         }
         expect(sr.reader).toBeInstanceOf(ScreenReader);
      },
      TIMEOUT_MS,
   );
});

describe('queuedScreenReader failures', () => {
   it(
      'delivers an awaited failure to that await and continues',
      async () => {
         await using sr = await queuedScreenReader({ html: CHECKOUT_HTML });
         sr.next('heading');

         const failure = await failureOf(sr.expectSpoken('Refund'));

         expect(failure).toBeInstanceOf(ScreenReaderAssertionError);
         expect(await sr.next('button')).toBe('button, Pay now');
      },
      TIMEOUT_MS,
   );

   it(
      'starts the stack of a failure at the test line that queued the command',
      async () => {
         await using sr = await queuedScreenReader({ html: CHECKOUT_HTML });
         sr.next('heading');

         const failure = await failureOf(sr.expectSpoken('Refund'));

         expect(failure).toBeInstanceOf(Error);
         if (!(failure instanceof Error)) {
            return;
         }
         const lines = (failure.stack ?? '').split('\n');
         const firstFrame = lines.find((line) => /^\s+at /u.test(line));
         expect(lines[0]).toBe(
            `ScreenReaderAssertionError: ${failure.message.split('\n')[0]}`,
         );
         expect(firstFrame).toMatch(/queued-screen-reader\.test\.ts:\d+:\d+/u);
         expect(failure.cause).toMatch(/screen-reader\.ts/u);
      },
      TIMEOUT_MS,
   );
});

describe('queuedScreenReader options', () => {
   it(
      'passes track and signal to the queue',
      async () => {
         const controller = new AbortController(),
            settled: Promise<void>[] = [];
         await using sr = await queuedScreenReader(
            { html: CHECKOUT_HTML },
            { ...collecting(settled), signal: controller.signal },
         );

         sr.next('heading');
         controller.abort(new Error('test timed out'));
         const skipped = sr.next('button');

         expect(settled).toEqual([expect.any(Promise), expect.any(Promise)]);
         await expect(failureOf(skipped)).resolves.toMatchObject({
            message: 'test timed out',
         });
         await expect(Promise.all(settled)).resolves.toEqual([undefined, undefined]);
      },
      TIMEOUT_MS,
   );
});

describe('queueScreenReader', () => {
   it(
      'rethrows a failure nobody awaited from stop, after stopping the reader',
      async () => {
         const reader = await screenReader({ html: CHECKOUT_HTML });
         const sr = queueScreenReader(reader);
         sr.next('heading');
         sr.expectSpoken('Refund');
         sr.next('button');

         await expect(sr.stop()).rejects.toBeInstanceOf(ScreenReaderAssertionError);
         await expect(reader.next()).rejects.toMatchObject({ code: 'session-stopped' });
      },
      TIMEOUT_MS,
   );

   it(
      'resolves stop when track received the failure',
      async () => {
         const settled: Promise<void>[] = [];
         const sr = queueScreenReader(
            await screenReader({ html: CHECKOUT_HTML }),
            collecting(settled),
         );
         sr.expectSpoken('Refund');

         await sr.stop();

         await expect(settled[0]).rejects.toBeInstanceOf(ScreenReaderAssertionError);
      },
      TIMEOUT_MS,
   );
});
