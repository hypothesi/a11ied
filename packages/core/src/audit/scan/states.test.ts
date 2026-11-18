import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StateInventory } from '@a11ied/audit';
import { createTestServer } from '../../../../cli/src/testing/fixtures.js';
import { withLoadedPage } from '../../browser/shared-browser.js';
import { collectStateInventory } from './states.js';

const server = createTestServer();

const PAGE = [
   '<button class="nav-toggle"><svg></svg></button>',
   '<button aria-expanded="false">More</button>',
   '<button aria-haspopup="dialog">Settings</button>',
   '<details><summary>Shipping</summary>Two days</details>',
   '<form><label>Email <input type="email" required></label><button>Send</button></form>',
   '<a href="/next">Next page</a>',
   '<chat-box></chat-box>',
   '<script>',
   'customElements.define("chat-box", class extends HTMLElement {',
   '   connectedCallback() {',
   '      this.attachShadow({ mode: "open" }).innerHTML = "<button>Open chat</button>";',
   '   }',
   '});',
   '</script>',
].join('');

async function inventoryOf(html: string): Promise<StateInventory> {
   let inventory: StateInventory = { triggers: [], omitted: 0 };
   await withLoadedPage(
      { kind: 'goto', url: `${server.getBaseUrl()}/link-navigation.html` },
      async (page) => {
         await page.setContent(html);
         inventory = await collectStateInventory(page);
      },
   );
   return inventory;
}

beforeAll(async () => {
   await server.start();
});

afterAll(async () => {
   await server.stop();
});

describe('state inventory', () => {
   it('lists every control that can change the page, including inside shadow roots', async () => {
      const inventory = await inventoryOf(PAGE);

      expect(inventory.triggers.map((trigger) => [trigger.kind, trigger.label])).toEqual([
         ['control', 'button.nav-toggle'],
         ['disclosure', 'More'],
         ['dialog', 'Settings'],
         ['disclosure', 'Shipping'],
         ['form', 'Form: validation and error states'],
         ['embedded', 'chat-box'],
         ['control', 'Open chat'],
      ]);
   });

   it('gives selectors that find each control again', async () => {
      const inventory = await inventoryOf(PAGE);
      const counts: number[] = [];

      await withLoadedPage(
         { kind: 'goto', url: `${server.getBaseUrl()}/link-navigation.html` },
         async (page) => {
            await page.setContent(PAGE);
            counts.push(
               ...(await Promise.all(
                  inventory.triggers.map((trigger) =>
                     page.locator(trigger.selector).count(),
                  ),
               )),
            );
         },
      );

      const missing = inventory.triggers
         .filter((_trigger, index) => counts[index] === 0)
         .map((trigger) => trigger.selector);

      expect(missing).toEqual([]);
   });
});
