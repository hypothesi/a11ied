import { describe, expect } from 'vitest';

import { test } from './index.js';

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

const checkout = test.extend({ srOptions: { html: CHECKOUT_HTML } });

describe('the sr fixture', () => {
   checkout(
      'starts a reader from srOptions and stops it after the test',
      async ({ sr }) => {
         expect(sr.session.engine).toBe('jsdom');
         expect(await sr.next('heading')).toBe('heading, Checkout, level 1');
      },
      TIMEOUT_MS,
   );

   test(
      'defaults to the virtual reader on an empty document',
      async ({ sr }) => {
         expect(sr.session).toMatchObject({ sr: 'virtual', mode: 'in-process' });
         expect(await sr.next('heading')).toBe('heading, a11ied virtual target, level 1');
      },
      TIMEOUT_MS,
   );
});

describe('toHaveSpoken', () => {
   checkout(
      'reads the transcript of a reader and names the transcript on failure',
      async ({ sr }) => {
         await sr.next('heading');
         await sr.checkpoint('after heading');
         await sr.next('button');

         await expect(sr).toHaveSpoken('Checkout');
         await expect(sr).toHaveSpoken(/pay now/iu, { since: 'after heading' });
         await expect(sr).not.toHaveSpoken('Checkout', { since: 'after heading' });
         await expect(expect(sr).toHaveSpoken('Refund')).rejects.toThrow(
            /"Refund" was not announced in the transcript \(\d+ phrases checked\)\.\nThe reader said:\n {2}"document"/u,
         );
      },
      TIMEOUT_MS,
   );

   test('accepts bare phrases and transcript entries', () => {
      expect(['heading, Checkout, level 1', 'button, Pay now']).toHaveSpoken('pay now');
      expect([
         { index: 0, at: '2026-09-05T00:00:00.000Z', phrase: 'button, Pay now' },
      ]).toHaveSpoken('Pay now');
      expect(() => expect(['document']).toHaveSpoken('Pay now')).toThrow(
         '"Pay now" was not announced in the transcript (1 phrases checked).',
      );
      expect(() => expect(['button, Pay now']).not.toHaveSpoken('Pay now')).toThrow(
         '"Pay now" was announced in the transcript: "button, Pay now".',
      );
   });
});

describe('toHaveSpokenInOrder', () => {
   test('finds each match after the previous one', () => {
      const phrases = [
         'document',
         'heading, Checkout, level 1',
         'paragraph',
         'button, Pay now',
      ];

      expect(phrases).toHaveSpokenInOrder(['Checkout', /pay/iu]);
      expect(phrases).not.toHaveSpokenInOrder(['Pay now', 'Checkout']);
      expect(() => expect(phrases).toHaveSpokenInOrder(['Checkout', 'Refund'])).toThrow(
         '"Refund" was not announced after "heading, Checkout, level 1". Wanted "Checkout", then "Refund" (4 phrases checked).',
      );
   });

   checkout(
      'reads the transcript of a reader',
      async ({ sr }) => {
         await sr.next('heading');
         await sr.next('button');

         await expect(sr).toHaveSpokenInOrder(['document', 'Checkout', 'Pay now']);
      },
      TIMEOUT_MS,
   );
});

describe('toBeOn', () => {
   checkout(
      'checks the item under the cursor',
      async ({ sr }) => {
         await sr.goTo({ role: 'button', name: 'Pay now' });

         await expect(sr).toBeOn({ role: 'button', name: 'Pay now' });
         await expect(sr).toBeOn({ role: 'button' });
         await expect(sr).not.toBeOn({ role: 'heading' });
         await expect(
            expect(sr).toBeOn({ role: 'link', name: 'Pay now' }),
         ).rejects.toThrow(
            'Expected the cursor to be on role "link" and name "Pay now", but it is on button named "Pay now" (phrase: "button, Pay now").',
         );
         expect(await sr.read()).toBeOn({ name: 'pay now' });
      },
      TIMEOUT_MS,
   );
});
