import type { ScreenReaderTestCase } from '../types.js';

const ARIA_LABEL_REF = {
   title: 'WAI-ARIA 1.2: aria-label property',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-label',
   section: '6.6.1 aria-label',
} as const;

const ACCNAME_STEP_2C_REF = {
   title: 'Accessible Name and Description Computation 1.2: Step 2C',
   url: 'https://www.w3.org/TR/accname-1.2/#step2C',
   section: '4.3.1 Step 2C (aria-label)',
} as const;

const NAME_PROHIBITED_REF = {
   title: 'WAI-ARIA 1.2: Roles Prohibiting Naming',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#namefromprohibited',
   section: '5.2.8.4 Roles Supporting Name from Author / Prohibited',
} as const;

export const ariaLabelCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-label-button-override',
      title: 'aria-label: Overrides visible button text',
      isolatedTitle: 'aria-label button override test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-label',
      tags: ['aria-label', 'button', 'override', 'accname'],
      summary:
         'Tests whether aria-label on a native button replaces its inner visible text ("X") with the accessible label ("Close settings dialog").',
      expectedBehavior:
         'The button should announce "Close settings dialog" with button role, overriding "X".',
      specReferences: [ARIA_LABEL_REF, ACCNAME_STEP_2C_REF],
      html: `<button type="button" aria-label="Close settings dialog">X</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Close settings dialog'],
         forbiddenPhrases: ['X'],
      },
   },
   {
      slug: 'aria-label-landmark-nav',
      title: 'aria-label: Names a navigation landmark region',
      isolatedTitle: 'aria-label landmark navigation test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-label',
      tags: ['aria-label', 'nav', 'landmark', 'navigation'],
      summary:
         'Tests whether aria-label on a <nav> element exposes an accessible name for the navigation landmark.',
      expectedBehavior:
         'The navigation landmark should expose the accessible name "Breadcrumb trail" along with its navigation role and inner link "Home".',
      specReferences: [ARIA_LABEL_REF, ACCNAME_STEP_2C_REF],
      html: `<nav aria-label="Breadcrumb trail">
   <a href="#home">Home</a>
</nav>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'navigation',
         expectedPhrases: ['Breadcrumb trail'],
      },
   },
   {
      slug: 'aria-label-prohibited-span',
      title: 'aria-label: Ignored on generic span (naming prohibited)',
      isolatedTitle: 'aria-label prohibited on span test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-label',
      tags: ['aria-label', 'generic', 'span', 'name-prohibited'],
      summary:
         'Tests whether screen readers ignore aria-label on a generic <span> element whose role prohibits naming.',
      expectedBehavior:
         'Because generic elements prohibit naming from author, the screen reader should read "Visible text" and MUST NOT replace it with "Secret label".',
      specReferences: [ARIA_LABEL_REF, NAME_PROHIBITED_REF],
      html: `<span aria-label="Secret label">Visible text</span>`,
      evaluation: {
         mode: 'walk',
         expectedPhrases: ['Visible text'],
         forbiddenPhrases: ['Secret label'],
      },
   },
];
