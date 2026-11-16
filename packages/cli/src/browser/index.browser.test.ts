import { afterEach, describe, expect, it } from 'vitest';

import { screenReader, test } from './index.js';

const MAX_EDGE_TRANSCRIPT_ENTRIES = 30;

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

function mountShadowChat(): { root: HTMLElement; shadow: ShadowRoot } {
   const host = document.createElement('div');
   document.body.append(host);
   const root = document.createElement('div'),
      shadow = host.attachShadow({ mode: 'open' });
   root.innerHTML = '<h1>Chat</h1><button>Name</button><button>Send</button>';
   shadow.append(root);
   return { root, shadow };
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
      await expect(sr).toHaveCursorOn({ role: 'button', name: 'Pay now' });
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

describe('scoped virtual tree boundaries', () => {
   it('rejects an unavailable generic-container edge after one cursor cycle', async () => {
      const { root, shadow } = mountShadowChat();
      await using sr = await screenReader({ container: root });
      const before = await sr.read();

      await expect(sr.top()).rejects.toMatchObject({
         code: 'virtual-tree-edge-unavailable',
      });
      expect(await sr.read()).toEqual(before);
      const afterTop = await sr.transcript();

      expect(afterTop.length).toBeLessThan(MAX_EDGE_TRANSCRIPT_ENTRIES);
      await expect(sr.bottom()).rejects.toMatchObject({
         code: 'virtual-tree-edge-unavailable',
      });
      const afterBottom = await sr.transcript();

      expect(afterBottom.length).toBeLessThan(MAX_EDGE_TRANSCRIPT_ENTRIES);
      expect(await sr.next('button')).toBe('button, Name');
      expect(root.parentNode).toBe(shadow);
      expect(root.hasAttribute('role')).toBe(false);
   });

   it('seeks both announced boundaries of a scoped semantic container', async () => {
      const root = mountCheckout();
      await using sr = await screenReader({ container: root });
      await sr.next('button');

      expect(await sr.top()).toBe('main');
      expect(await sr.bottom()).toBe('end of main');
   });
});
