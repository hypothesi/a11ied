import type { ScreenReaderTestCase } from '../types.js';

const ARIA_DISABLED_REF = {
   title: 'WAI-ARIA 1.2: aria-disabled state',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-disabled',
   section: '6.6.4 aria-disabled',
} as const;

export const ariaDisabledCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-disabled-button',
      title: 'aria-disabled: Button remains focusable and announces disabled state',
      isolatedTitle: 'aria-disabled button test',
      category: 'aria',
      featureGroup: 'Widget States',
      attribute: 'aria-disabled',
      tags: ['aria-disabled', 'button', 'dimmed', 'disabled'],
      summary:
         'Tests whether a button with aria-disabled="true" remains reachable and announces its disabled/dimmed state.',
      expectedBehavior:
         'The screen reader should reach the button and announce "Publish changes", button, and a disabled state ("disabled", "dimmed", or "unavailable").',
      specReferences: [ARIA_DISABLED_REF],
      html: `<button type="button" aria-disabled="true">Publish changes</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Publish changes'],
         expectedStateTerms: ['disabled'],
      },
   },
   {
      slug: 'aria-disabled-link',
      title: 'aria-disabled: Link announces disabled state',
      isolatedTitle: 'aria-disabled link test',
      category: 'aria',
      featureGroup: 'Widget States',
      attribute: 'aria-disabled',
      tags: ['aria-disabled', 'link', 'dimmed', 'disabled'],
      summary:
         'Tests whether an anchor element with aria-disabled="true" conveys its disabled/dimmed state to screen readers.',
      expectedBehavior:
         'The link should announce "Download archive", link, and a disabled state ("disabled", "dimmed", or "unavailable").',
      specReferences: [ARIA_DISABLED_REF],
      html: `<a href="#archive" aria-disabled="true">Download archive</a>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'link',
         expectedPhrases: ['Download archive'],
         expectedStateTerms: ['disabled'],
      },
   },
];
