import type { ScreenReaderTestCase } from '../types.js';

const ARIA_DESCRIBEDBY_REF = {
   title: 'WAI-ARIA 1.2: aria-describedby property',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-describedby',
   section: '6.6.1 aria-describedby',
} as const;

const ACCNAME_DESC_REF = {
   title: 'Accessible Name and Description Computation 1.2: Accessible Description',
   url: 'https://www.w3.org/TR/accname-1.2/#mapping_additional_nd_description',
   section: '4.1 Accessible Description Computation',
} as const;

export const ariaDescribedbyCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-describedby-input-hint',
      title: 'aria-describedby: Associates help text with form input',
      isolatedTitle: 'aria-describedby input hint test',
      category: 'aria',
      featureGroup: 'Accessible Description',
      attribute: 'aria-describedby',
      tags: ['aria-describedby', 'input', 'form', 'description'],
      summary:
         'Tests whether a text input labeled via <label> announces its programmatically associated hint text from aria-describedby.',
      expectedBehavior:
         'The text input should announce its accessible name ("API token") and its accessible description ("Starts with sk_live").',
      specReferences: [ARIA_DESCRIBEDBY_REF, ACCNAME_DESC_REF],
      html: `<label for="api-key">API token</label>
<input id="api-key" type="text" aria-describedby="api-hint" />
<p id="api-hint">Starts with sk_live</p>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'text',
         expectedPhrases: ['API token'],
         expectedStateTerms: ['Starts with sk_live'],
      },
   },
   {
      slug: 'aria-describedby-multiple-ids',
      title: 'aria-describedby: Concatenates multiple description IDs',
      isolatedTitle: 'aria-describedby multiple IDs test',
      category: 'aria',
      featureGroup: 'Accessible Description',
      attribute: 'aria-describedby',
      tags: ['aria-describedby', 'multiple-ids', 'button', 'description'],
      summary:
         'Tests whether aria-describedby concatenates multiple space-separated IDs into a single accessible description on a button.',
      expectedBehavior:
         'The button should announce "Delete project" along with both descriptions: "Permanent action." and "Cannot be undone.".',
      specReferences: [ARIA_DESCRIBEDBY_REF, ACCNAME_DESC_REF],
      html: `<button type="button" aria-describedby="desc-one desc-two">Delete project</button>
<p id="desc-one">Permanent action.</p>
<p id="desc-two">Cannot be undone.</p>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Delete project'],
         expectedStateTerms: ['Permanent action', 'Cannot be undone'],
      },
   },
   {
      slug: 'aria-describedby-hidden-target',
      title: 'aria-describedby: References display: none description',
      isolatedTitle: 'aria-describedby hidden target test',
      category: 'aria',
      featureGroup: 'Accessible Description',
      attribute: 'aria-describedby',
      tags: ['aria-describedby', 'display-none', 'hidden-description', 'button'],
      summary:
         'Tests whether a display: none element referenced directly by aria-describedby still provides the accessible description for a button.',
      expectedBehavior:
         'The hidden paragraph should not appear in cursor navigation, while the button announces "Submit form" with description "Sends application immediately".',
      specReferences: [ARIA_DESCRIBEDBY_REF, ACCNAME_DESC_REF],
      html: `<button type="button" aria-describedby="hidden-desc">Submit form</button>
<p id="hidden-desc" style="display: none;">Sends application immediately</p>`,
      evaluation: {
         mode: 'walk',
         targetRoleHint: 'button',
         expectedPhrases: ['Submit form'],
         expectedStateTerms: ['Sends application immediately'],
      },
   },
];
