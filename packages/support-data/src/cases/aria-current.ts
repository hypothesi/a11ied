import type { ScreenReaderTestCase } from '../types.js';

const ARIA_CURRENT_REF = {
   title: 'WAI-ARIA 1.2: aria-current state',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-current',
   section: '6.6.4 aria-current',
} as const;

export const ariaCurrentCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-current-page',
      title: 'aria-current: Announces current page on navigation link',
      isolatedTitle: 'aria-current page test',
      category: 'aria',
      featureGroup: 'Navigation State',
      attribute: 'aria-current',
      tags: ['aria-current', 'page', 'navigation', 'link'],
      summary:
         'Tests whether aria-current="page" on the active navigation link announces its current-page state.',
      expectedBehavior:
         'The "Pricing" link should announce "current page" (or "current") alongside its name and link role, while "Home" does not.',
      specReferences: [ARIA_CURRENT_REF],
      html: `<nav aria-label="Main">
   <a href="#home">Home</a>
   <a href="#pricing" aria-current="page">Pricing</a>
</nav>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'link',
         expectedPhrases: ['Pricing'],
         expectedStateTerms: ['current page'],
      },
   },
   {
      slug: 'aria-current-step',
      title: 'aria-current: Announces current step in multi-step list',
      isolatedTitle: 'aria-current step test',
      category: 'aria',
      featureGroup: 'Navigation State',
      attribute: 'aria-current',
      tags: ['aria-current', 'step', 'list', 'wizard'],
      summary:
         'Tests whether aria-current="step" on a list item in a multi-step checkout progress indicator is announced by screen readers.',
      expectedBehavior:
         'The "Shipping" item should be announced with a "current step" (or "current") indicator.',
      specReferences: [ARIA_CURRENT_REF],
      html: `<ol>
   <li>Account</li>
   <li aria-current="step">Shipping</li>
   <li>Payment</li>
</ol>`,
      evaluation: {
         mode: 'walk',
         expectedPhrases: ['Shipping'],
         expectedStateTerms: ['current step'],
      },
   },
];
