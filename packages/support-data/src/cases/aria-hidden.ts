import type { ScreenReaderTestCase } from '../types.js';

const ARIA_HIDDEN_REF = {
   title: 'WAI-ARIA 1.2: aria-hidden state',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-hidden',
   section: '6.6.4 aria-hidden',
} as const;

export const ariaHiddenCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'aria-hidden-true-text',
      title: 'aria-hidden: Hides visible content from screen reader',
      isolatedTitle: 'aria-hidden true text test',
      category: 'aria',
      featureGroup: 'Tree Inclusion',
      attribute: 'aria-hidden',
      tags: ['aria-hidden', 'visibility', 'accessibility-tree'],
      summary:
         'Tests whether an element with aria-hidden="true" is excluded from screen reader cursor navigation while remaining visually rendered.',
      expectedBehavior:
         'The screen reader should read "Visible sentence" and skip "Hidden decorative text" completely.',
      specReferences: [ARIA_HIDDEN_REF],
      html: `<p>Visible sentence</p>
<p aria-hidden="true">Hidden decorative text</p>`,
      evaluation: {
         mode: 'walk',
         expectedPhrases: ['Visible sentence'],
         forbiddenPhrases: ['Hidden decorative text'],
      },
   },
   {
      slug: 'aria-hidden-false-inside-true',
      title: 'aria-hidden: Descendant aria-hidden="false" stays hidden',
      isolatedTitle: 'aria-hidden false inside true test',
      category: 'aria',
      featureGroup: 'Tree Inclusion',
      attribute: 'aria-hidden',
      tags: ['aria-hidden', 'inheritance', 'accessibility-tree'],
      summary:
         'Tests the WAI-ARIA 1.2 rule that aria-hidden="false" on a child does NOT override aria-hidden="true" on an ancestor.',
      expectedBehavior:
         'Neither "Hidden parent text" nor "Nested aria-hidden false" should be exposed; only "After hidden block" should be read.',
      specReferences: [ARIA_HIDDEN_REF],
      html: `<div aria-hidden="true">
   <p>Hidden parent text</p>
   <p aria-hidden="false">Nested aria-hidden false</p>
</div>
<p>After hidden block</p>`,
      evaluation: {
         mode: 'walk',
         expectedPhrases: ['After hidden block'],
         forbiddenPhrases: ['Hidden parent text', 'Nested aria-hidden false'],
      },
   },
];
