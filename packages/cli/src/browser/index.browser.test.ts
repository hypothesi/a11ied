import { afterEach, describe, expect, it } from 'vitest';

import { screenReader, test } from './index.js';

afterEach(() => {
   document.body.innerHTML = '';
});

function mountCheckout(): HTMLElement {
   const root = document.createElement('main');
   root.innerHTML = `
      <h1>Checkout</h1>
      <p>Two items in your cart.</p>
      <button type="button" id="pay">Pay now</button>
      <div role="status" aria-live="polite" id="status"></div>
   `;
   document.body.append(root);
   root.querySelector('#pay')?.addEventListener('click', () => {
      const status = root.querySelector('#status');
      if (status) {
         status.textContent = 'Payment sent.';
      }
   });
   return root;
}

describe('screenReader in the browser', () => {
   it('reads the mounted component and hears what its script announces', async () => {
      const root = mountCheckout();
      await using sr = await screenReader({ container: root });

      expect(sr.session).toMatchObject({ sr: 'virtual', engine: 'browser' });
      expect(await sr.next('heading')).toBe('heading, Checkout, level 1');
      expect(await sr.goTo({ role: 'button', name: 'Pay now' })).toBe('button, Pay now');
      await sr.checkpoint('paying');
      await sr.activate();

      await expect(sr).toHaveSpoken('Payment sent', { since: 'paying' });
      await expect(sr).toBeOn({ role: 'button', name: 'Pay now' });
   });

   it('refuses open() because the page is the test page', async () => {
      mountCheckout();
      await using sr = await screenReader();

      await expect(sr.open('http://localhost/other')).rejects.toMatchObject({
         code: 'unsupported-in-browser',
      });
   });

   test('provides the sr fixture over the document body', async ({ sr }) => {
      mountCheckout();
      await sr.top();

      expect(await sr.next('button')).toBe('button, Pay now');
   });
});
