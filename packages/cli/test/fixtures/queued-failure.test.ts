import { describe, expect } from 'vitest';

import { test } from '../../src/vitest/index.js';

/*
 * Spawned by `packages/cli/src/vitest/queued.test.ts` with the root
 * `vitest.queued-failure.config.ts`. The first and third tests fail on purpose.
 */
const CHECKOUT_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Checkout</title></head>
  <body>
    <main>
      <h1>Checkout</h1>
      <button type="button">Pay now</button>
    </main>
  </body>
</html>
`;

const checkout = test.extend({ srOptions: { html: CHECKOUT_HTML } });

describe('queued failures', () => {
   checkout('reports a failure nobody awaited on the test itself', ({ sr }) => {
      sr.next('heading');
      sr.expectSpoken('Refund');
      sr.next('button');
   });

   checkout('passes when the test awaits the rejection', async ({ sr }) => {
      sr.next('heading');

      await expect(sr.expectSpoken('Refund')).rejects.toThrow('Refund');
      expect(await sr.next('button')).toBe('button, Pay now');
   });

   checkout('reports only the error the test body threw', ({ sr }) => {
      sr.next('heading');
      sr.expectSpoken('Refund');
      throw new Error('thrown by the test body');
   });
});
