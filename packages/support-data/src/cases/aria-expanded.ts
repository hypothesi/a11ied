import type { ScreenReaderTestCase } from '../types.js';

const ARIA_EXPANDED_REF = {
   title: 'WAI-ARIA 1.2: aria-expanded state',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-expanded',
   section: '6.6.4 aria-expanded',
} as const;

export const ariaExpandedCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-expanded-false-initial',
      title: 'aria-expanded: Announces collapsed state for false',
      isolatedTitle: 'aria-expanded false initial test',
      category: 'aria',
      featureGroup: 'Widget States',
      attribute: 'aria-expanded',
      tags: ['aria-expanded', 'button', 'collapsed', 'disclosure'],
      summary:
         'Tests whether a disclosure button with aria-expanded="false" announces its collapsed state alongside its label and button role.',
      expectedBehavior:
         'The button should announce "Account menu", role button, and its collapsed state ("collapsed").',
      specReferences: [ARIA_EXPANDED_REF],
      html: `<button type="button" aria-expanded="false">Account menu</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Account menu'],
         expectedStateTerms: ['collapsed'],
      },
   },
   {
      slug: 'aria-expanded-toggle-dynamic',
      title: 'aria-expanded: Updates from collapsed to expanded on activation',
      isolatedTitle: 'aria-expanded dynamic toggle test',
      category: 'aria',
      featureGroup: 'Widget States',
      attribute: 'aria-expanded',
      tags: ['aria-expanded', 'dynamic', 'toggle', 'disclosure'],
      summary:
         'Tests whether activating an aria-expanded button updates its state from collapsed to expanded and announces the expanded state.',
      expectedBehavior:
         'Initially the "Details" button announces collapsed; after activation it updates aria-expanded="true", reveals #panel, and announces expanded.',
      specReferences: [ARIA_EXPANDED_REF],
      html: `<button type="button" id="toggle-btn" aria-expanded="false" aria-controls="panel">Details</button>
<div id="panel" hidden>Panel details content</div>`,
      js: `const toggleBtn = document.getElementById('toggle-btn');
const panel = document.getElementById('panel');
toggleBtn?.addEventListener('click', () => {
   const nextExpanded = toggleBtn.getAttribute('aria-expanded') !== 'true';
   toggleBtn.setAttribute('aria-expanded', String(nextExpanded));
   if (panel) {
      panel.hidden = !nextExpanded;
   }
});`,
      evaluation: {
         mode: 'interact',
         targetRoleHint: 'button',
         activateButtonText: 'Details',
         preActionExpectedPhrases: ['Details'],
         expectedPhrases: ['expanded'],
         expectedStateTerms: ['expanded'],
      },
   },
];
