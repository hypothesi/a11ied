import { describe } from 'vitest';
import { test } from 'a11ied/vitest';

/*
 * The accordion demo on the Reka UI docs, read with the virtual screen reader. Each test
 * names the row of the ARIA Authoring Practices Guide (APG) accordion example it covers
 * (`a1 pattern accordion`) and the WCAG criterion that row serves.
 */
const ACCORDION_URL = 'https://reka-ui.com/docs/components/accordion';
const FIRST = 'Is it accessible?',
   SECOND = 'Is it unstyled?',
   THIRD = 'Can it be animated?';
const FIRST_PANEL_TEXT = 'Yes. It adheres to the WAI-ARIA design pattern.';

const accordion = test.extend({ srOptions: { url: ACCORDION_URL } });

/** The header's phrase, which ends in the state and may carry a control count. */
function headerPhrase(name: string, state: string): RegExp {
   const escaped = name.replace('?', String.raw`\?`);
   return new RegExp(`^button, ${escaped}.*, ${state}$`, 'u');
}

function expandedPhrase(name: string): RegExp {
   return headerPhrase(name, 'expanded');
}

function collapsedPhrase(name: string): RegExp {
   return headerPhrase(name, 'not expanded');
}

describe('headers', () => {
   /*
    * APG h3-element. The button is the only element inside the heading, so the heading
    * ends right after it. WCAG 1.3.1 Info and Relationships, 2.4.6 Headings and Labels.
    */
   accordion(
      'each header is a level 3 heading with only the button inside it',
      ({ sr }) => {
         for (const name of [FIRST, SECOND, THIRD]) {
            sr.goTo({ role: 'button', name })
               .next()
               .expect.spoken(`end of heading, ${name}, level 3`);
         }
      },
   );

   // APG button-aria-expanded. WCAG 4.1.2 Name, Role, Value.
   accordion(
      'the open header says expanded and the others say not expanded',
      ({ sr }) => {
         sr.goTo({ role: 'button', name: FIRST })
            .expect.spoken(expandedPhrase(FIRST))
            .goTo({ role: 'button', name: SECOND })
            .expect.spoken(collapsedPhrase(SECOND))
            .goTo({ role: 'button', name: THIRD })
            .expect.spoken(collapsedPhrase(THIRD));
      },
   );

   // APG button-aria-controls. WCAG 4.1.2 Name, Role, Value.
   accordion('a header refers to its panel before anyone interacts', ({ sr }) => {
      sr.goTo({ role: 'button', name: FIRST }).expect.spoken(
         `button, ${FIRST}, 1 control, expanded`,
      );
   });

   accordion('a header refers to its panel after it is activated', ({ sr }) => {
      sr.goTo({ role: 'button', name: SECOND })
         .press('Enter')
         .expect.spoken(`button, ${SECOND}, 1 control, expanded`);
   });
});

describe('keyboard', () => {
   // APG key-enter-or-space. WCAG 2.1.1 Keyboard, 3.2.2 On Input.
   accordion('Enter on a collapsed header expands it and keeps focus there', ({ sr }) => {
      sr.goTo({ role: 'button', name: SECOND })
         .checkpoint('enter')
         .press('Enter')
         .expect.spoken(expandedPhrase(SECOND), { since: 'enter' })
         .and.cursorOn({ role: 'button', name: SECOND });
   });

   accordion('Space on a collapsed header expands it and keeps focus there', ({ sr }) => {
      sr.goTo({ role: 'button', name: THIRD })
         .checkpoint('space')
         .press('Space')
         .expect.spoken(expandedPhrase(THIRD), { since: 'space' })
         .and.cursorOn({ role: 'button', name: THIRD });
   });

   // APG Enter or Space: an implementation that allows one open panel collapses the other.
   accordion('opening a header collapses the header that was open', ({ sr }) => {
      sr.goTo({ role: 'button', name: SECOND })
         .press('Enter')
         .checkpoint('opened-second')
         .top()
         .goTo({ role: 'button', name: FIRST })
         .expect.spoken(collapsedPhrase(FIRST), { since: 'opened-second' });
   });

   accordion('Enter on the open header collapses it', ({ sr }) => {
      sr.goTo({ role: 'button', name: FIRST })
         .checkpoint('enter')
         .press('Enter')
         .expect.spoken(collapsedPhrase(FIRST), { since: 'enter' });
   });

   // APG key-tab and key-shift-tab. WCAG 2.1.1 Keyboard, 2.4.3 Focus Order.
   accordion('Tab and Shift+Tab move through the headers in page order', ({ sr }) => {
      sr.goTo({ role: 'button', name: FIRST })
         .press('Tab')
         .expect.cursorOn({ role: 'button', name: SECOND })
         .press('Tab')
         .expect.cursorOn({ role: 'button', name: THIRD })
         .press('Shift+Tab')
         .expect.cursorOn({ role: 'button', name: SECOND });
   });
});

describe('panels', () => {
   // APG region-role and region-aria-labelledby. WCAG 1.3.1 Info and Relationships.
   accordion('the open panel is a region named by its header', ({ sr }) => {
      sr.goTo({ role: 'button', name: FIRST })
         .next()
         .next()
         .expect.cursorOn({ role: 'region', name: FIRST })
         .next()
         .expect.spokenInOrder([
            `end of heading, ${FIRST}, level 3`,
            `region, ${FIRST}`,
            FIRST_PANEL_TEXT,
         ]);
   });

   accordion('a collapsed panel is skipped, so the next header follows', ({ sr }) => {
      sr.goTo({ role: 'button', name: SECOND })
         .checkpoint('collapsed')
         .next()
         .next()
         .expect.spoken(`region, ${SECOND}`, { not: true, since: 'collapsed' })
         .and.spoken(`heading, ${THIRD}, level 3`, { since: 'collapsed' });
   });
});
