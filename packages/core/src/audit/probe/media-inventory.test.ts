import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchAutomationBrowser } from '../../browser/runtime.js';
import { openProbePage } from './page-facts.js';
import { collectMediaInventory, judgeMediaInventory } from './media-inventory.js';

const fixture: { browser?: Browser } = {};
beforeAll(async () => {
   const launched = await launchAutomationBrowser();
   fixture.browser = launched.browser;
});
afterAll(async () => {
   await fixture.browser?.close();
});

describe('media absence observations', () => {
   it.each([
      { name: 'plain content', body: '<p>Plain content</p>', outcome: 'inapplicable' },
      {
         name: 'closed shadow media',
         body: '<div id="host"></div><script>document.getElementById("host").attachShadow({mode:"closed"}).innerHTML="<video></video>";</script>',
         outcome: 'cantTell',
      },
      {
         name: 'frame media',
         body: '<iframe srcdoc="<audio></audio>"></iframe>',
         outcome: 'cantTell',
      },
      {
         name: 'Web Audio',
         body: '<script>new AudioContext();</script>',
         outcome: 'cantTell',
      },
      {
         name: 'missing instrumentation',
         body: '<script>delete window.__a11;</script>',
         outcome: 'cantTell',
      },
   ])('keeps $name honest', async ({ body, outcome }) => {
      if (!fixture.browser) {
         throw new Error('Missing browser fixture.');
      }
      const page = await openProbePage(fixture.browser);
      try {
         await page.goto(`data:text/html,${encodeURIComponent(body)}`, {
            waitUntil: 'load',
         });
         const inventory = await collectMediaInventory(page);

         expect(judgeMediaInventory(inventory).outcome).toBe(outcome);
      } finally {
         await page.context().close();
      }
   });
});
