import type { ScreenReaderTestCase } from '../types.js';

const WAI_ARIA_LABELLEDBY_REF = {
   title: 'WAI-ARIA 1.2: aria-labelledby property',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-labelledby',
   section: '6.6.1 aria-labelledby',
} as const;

const ACCNAME_STEP_2B_REF = {
   title: 'Accessible Name and Description Computation 1.2: Step 2B',
   url: 'https://www.w3.org/TR/accname-1.2/#step2B',
   section: '4.3.1 Step 2B (aria-labelledby)',
} as const;

const ACCNAME_PRECEDENCE_REF = {
   title: 'Accessible Name and Description Computation 1.2: Computation Steps',
   url: 'https://www.w3.org/TR/accname-1.2/#mapping_additional_nd_te',
   section: '4.3 Text Alternative Computation',
} as const;

const NAME_PROHIBITED_REF = {
   title: 'WAI-ARIA 1.2: Roles Prohibiting Naming',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#namefromprohibited',
   section: '5.2.8.4 Roles Supporting Name from Author / Prohibited',
} as const;

const HTML_AAM_REF = {
   title: 'HTML Accessibility API Mappings 1.0',
   url: 'https://www.w3.org/TR/html-aam-1.0/#accname-and-description-computation',
   section: '4. Accessible Name and Description Computation',
} as const;

export const ariaLabelledbyCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-labelledby-single-id',
      title: 'aria-labelledby: Single ID overrides button text',
      isolatedTitle: 'aria-labelledby single ID test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'button', 'accname', 'override'],
      summary:
         'Tests whether a button with aria-labelledby pointing to a single external heading announces the referenced heading text instead of its inner text.',
      expectedBehavior:
         'The heading is announced as "Billing address", and the button is announced with accessible name "Billing address" (role button), completely overriding its inner text "Edit".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<h2 id="billing-heading">Billing address</h2>
<button type="button" aria-labelledby="billing-heading">Edit</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Billing address'],
         forbiddenPhrases: ['Edit'],
         minimumOccurrences: 2,
      },
   },
   {
      slug: 'aria-labelledby-multiple-ids',
      title: 'aria-labelledby: Multiple space-separated IDs',
      isolatedTitle: 'aria-labelledby multiple IDs test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'multiple-ids', 'concatenation', 'button'],
      summary:
         'Tests whether aria-labelledby concatenates text from multiple space-separated ID references into one accessible name on a button.',
      expectedBehavior:
         'The button should announce "Delete quarterly invoice" by joining the text of #action-verb and #item-name with spaces, ignoring its inner "X" text.',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<p><span id="action-verb">Delete</span> <span id="item-name">quarterly invoice</span></p>
<button type="button" aria-labelledby="action-verb item-name">X</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Delete quarterly invoice'],
         forbiddenPhrases: ['X, button', 'button X'],
      },
   },
   {
      slug: 'aria-labelledby-reverse-dom-order',
      title: 'aria-labelledby: Attribute ID order overrides DOM order',
      isolatedTitle: 'aria-labelledby reverse DOM order test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'id-order', 'dom-order', 'button'],
      summary:
         'Tests whether screen readers concatenate referenced elements in the order specified in the aria-labelledby attribute rather than their DOM order.',
      expectedBehavior:
         'Because aria-labelledby="adj-part noun-part" lists #adj-part first, the button must announce "Account settings" even though #noun-part ("settings") appears earlier in the DOM.',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<p><span id="noun-part">settings</span> <span id="adj-part">Account</span></p>
<button type="button" aria-labelledby="adj-part noun-part">Open</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Account settings'],
         forbiddenPhrases: ['settings Account, button', 'Open'],
      },
   },
   {
      slug: 'aria-labelledby-self-reference',
      title: 'aria-labelledby: Self-referencing ID plus external label',
      isolatedTitle: 'aria-labelledby self-reference test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'self-reference', 'concatenation', 'button'],
      summary:
         'Tests whether an element can reference its own ID alongside another element ID to combine its inner text with external context.',
      expectedBehavior:
         'The button should announce "Remove Monthly plan" by resolving #remove-btn first and appending #plan-name.',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<p id="plan-name">Monthly plan</p>
<button type="button" id="remove-btn" aria-labelledby="remove-btn plan-name">Remove</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Remove Monthly plan'],
      },
   },
   {
      slug: 'aria-labelledby-display-none-target',
      title: 'aria-labelledby: References display: none target',
      isolatedTitle: 'aria-labelledby display none target test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'display-none', 'hidden-label', 'accname'],
      summary:
         'Tests the AccName 1.2 rule that a hidden element (display: none) still supplies its text when directly referenced by aria-labelledby.',
      expectedBehavior:
         'The display: none span must NOT appear as a separate item in the screen reader cursor order, yet the button MUST announce "Export CSV report" instead of "Download".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<span id="hidden-export-label" style="display: none;">Export CSV report</span>
<button type="button" aria-labelledby="hidden-export-label">Download</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Export CSV report'],
         forbiddenPhrases: ['Download'],
      },
   },
   {
      slug: 'aria-labelledby-aria-hidden-target',
      title: 'aria-labelledby: References aria-hidden="true" target',
      isolatedTitle: 'aria-labelledby aria-hidden target test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'aria-hidden', 'hidden-label', 'accname'],
      summary:
         'Tests whether a directly referenced element with aria-hidden="true" still computes the accessible name of the referencing control.',
      expectedBehavior:
         'The aria-hidden span is excluded from standalone reading, while the button announces "Archive message" instead of "Move".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<span id="aria-hidden-label" aria-hidden="true">Archive message</span>
<button type="button" aria-labelledby="aria-hidden-label">Move</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Archive message'],
         forbiddenPhrases: ['Move'],
      },
   },
   {
      slug: 'aria-labelledby-precedence-over-aria-label',
      title: 'aria-labelledby: Precedence over aria-label and label[for]',
      isolatedTitle: 'aria-labelledby precedence test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'aria-label', 'label', 'precedence', 'input'],
      summary:
         'Tests accessible name source precedence on a native text input that has aria-labelledby, aria-label, and a native <label for> element.',
      expectedBehavior:
         'Per AccName 1.2, aria-labelledby wins over both aria-label and native <label>. The text input should be named "Primary email", not "Secondary email" or "Backup email".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_PRECEDENCE_REF, HTML_AAM_REF],
      html: `<p id="preferred-label">Primary email</p>
<label for="email-field">Backup email</label>
<input id="email-field" type="text" aria-label="Secondary email" aria-labelledby="preferred-label" />`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'text',
         expectedPhrases: ['Primary email'],
         forbiddenPhrases: ['Secondary email'],
         minimumOccurrences: 2,
      },
   },
   {
      slug: 'aria-labelledby-broken-id-fallback',
      title: 'aria-labelledby: Broken ID falls back to inner content',
      isolatedTitle: 'aria-labelledby broken ID fallback test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'fallback', 'missing-id', 'button'],
      summary:
         'Tests fallback behavior when aria-labelledby references an ID that does not exist in the document.',
      expectedBehavior:
         'Because #does-not-exist resolves to nothing, Step 2B returns empty and accessible name computation falls back to the button text: "Save draft".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_PRECEDENCE_REF],
      html: `<button type="button" aria-labelledby="does-not-exist">Save draft</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Save draft'],
      },
   },
   {
      slug: 'aria-labelledby-chained-no-recursion',
      title: 'aria-labelledby: Chained references do not recurse',
      isolatedTitle: 'aria-labelledby chained no recursion test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'recursion', 'chained', 'accname'],
      summary:
         'Tests AccName 1.2 Step 2B rule prohibiting recursive traversal of aria-labelledby on an already-referenced element.',
      expectedBehavior:
         'The button references #parent-label, which itself has aria-labelledby="grandparent-label". The button name MUST use #parent-label subtree text ("Parent text") and MUST NOT follow the chain to "Grandparent label".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, ACCNAME_STEP_2B_REF],
      html: `<span id="grandparent-label">Grandparent label</span>
<span id="parent-label" aria-labelledby="grandparent-label">Parent text</span>
<button type="button" aria-labelledby="parent-label">Original button</button>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Parent text'],
         forbiddenPhrases: ['Grandparent label', 'Original button'],
      },
   },
   {
      slug: 'aria-labelledby-prohibited-generic-div',
      title: 'aria-labelledby: Ignored on generic div (naming prohibited)',
      isolatedTitle: 'aria-labelledby prohibited on generic div test',
      category: 'aria',
      featureGroup: 'Accessible Naming',
      attribute: 'aria-labelledby',
      tags: ['aria-labelledby', 'generic', 'div', 'name-prohibited'],
      summary:
         'Tests whether screen readers honor WAI-ARIA 1.2 prohibition against naming generic containers (<div> with no role) via aria-labelledby.',
      expectedBehavior:
         'Because the generic role prohibits accessible naming from author, the <div> should read its text content "Visible paragraph text" rather than replacing it with "Special announcement".',
      specReferences: [WAI_ARIA_LABELLEDBY_REF, NAME_PROHIBITED_REF],
      html: `<span id="override-label">Special announcement</span>
<div aria-labelledby="override-label">Visible paragraph text</div>`,
      evaluation: {
         mode: 'walk',
         expectedPhrases: ['Visible paragraph text'],
         maxPhraseOccurrences: {
            'Special announcement': 1,
         },
      },
   },
];
