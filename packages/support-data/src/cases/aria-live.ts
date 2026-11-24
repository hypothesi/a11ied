import type { ScreenReaderTestCase } from '../types.js';

const ARIA_LIVE_REF = {
   title: 'WAI-ARIA 1.2: aria-live property',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-live',
   section: '6.6.2 aria-live',
} as const;

export const ariaLiveCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-live-polite-update',
      title: 'aria-live: Announces polite live region update after button click',
      isolatedTitle: 'aria-live polite update test',
      category: 'aria',
      featureGroup: 'Live Regions',
      attribute: 'aria-live',
      tags: ['aria-live', 'polite', 'live-region', 'dynamic'],
      summary:
         'Tests whether dynamically inserting text into an aria-live="polite" container after activating a button triggers a screen reader announcement.',
      expectedBehavior:
         'After activating "Save settings", the screen reader should announce "Preferences saved" without moving focus.',
      specReferences: [ARIA_LIVE_REF],
      html: `<button type="button" id="trigger-polite">Save settings</button>
<div id="polite-status" aria-live="polite"></div>`,
      js: `const trigger = document.getElementById('trigger-polite');
const status = document.getElementById('polite-status');
trigger?.addEventListener('click', () => {
   if (status) {
      status.textContent = 'Preferences saved';
   }
});`,
      evaluation: {
         mode: 'interact',
         targetRoleHint: 'button',
         activateButtonText: 'Save settings',
         preActionExpectedPhrases: ['Save settings'],
         expectedPhrases: ['Preferences saved'],
      },
   },
   {
      slug: 'aria-live-assertive-update',
      title: 'aria-live: Announces assertive live region update',
      isolatedTitle: 'aria-live assertive update test',
      category: 'aria',
      featureGroup: 'Live Regions',
      attribute: 'aria-live',
      tags: ['aria-live', 'assertive', 'live-region', 'dynamic'],
      summary:
         'Tests whether updating an aria-live="assertive" region dynamically after button activation produces an announcement.',
      expectedBehavior:
         'After activating "Validate token", the screen reader should announce "Session expired" from the assertive live region.',
      specReferences: [ARIA_LIVE_REF],
      html: `<button type="button" id="trigger-assertive">Validate token</button>
<div id="assertive-status" aria-live="assertive"></div>`,
      js: `const trigger = document.getElementById('trigger-assertive');
const status = document.getElementById('assertive-status');
trigger?.addEventListener('click', () => {
   if (status) {
      status.textContent = 'Session expired';
   }
});`,
      evaluation: {
         mode: 'interact',
         targetRoleHint: 'button',
         activateButtonText: 'Validate token',
         preActionExpectedPhrases: ['Validate token'],
         expectedPhrases: ['Session expired'],
      },
   },
];
