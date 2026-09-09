import { describe } from 'vitest';
import { test, type QueuedChain, type QueuedCommands } from 'a11ied/vitest';

/*
 * The tags input demo on the Reka UI docs, read with the virtual screen reader. The APG
 * has no tags input pattern, so each test names the WCAG criterion it covers instead. The
 * demo starts with two tags, Apple and Banana, and a text field after them.
 */
const TAGS_URL = 'https://reka-ui.com/docs/components/tags-input';

const tagsInput = test.extend({ srOptions: { url: TAGS_URL } });

/** Tabs from the demo's code switch into the text field, which is the next stop. */
function focusInput(sr: QueuedCommands): QueuedChain<string> {
   return sr.goTo({ role: 'switch', name: 'View code' }).press('Tab');
}

describe('the field and the tags', () => {
   // WCAG 4.1.2 Name, Role, Value, 3.3.2 Labels or Instructions: the field needs a name.
   tagsInput('the text field is named', ({ sr }) => {
      focusInput(sr).expect.cursorOn(
         { role: 'textbox', name: 'Fruit' },
         { timeoutMs: 0 },
      );
   });

   // WCAG 1.3.1 Info and Relationships: each tag is read with its text and its state.
   tagsInput('each tag is read with its text and whether it is current', ({ sr }) => {
      sr.goTo({ role: 'switch', name: 'View code' })
         .next()
         .expect.spoken('Apple, not current item')
         .goTo({ role: 'button', name: 'Banana' })
         .next()
         .next()
         .expect.spoken('Banana, not current item');
   });

   // WCAG 4.1.2 Name, Role, Value, 2.4.6 Headings and Labels: a button says what it does.
   tagsInput('the button on each tag says that it removes the tag', ({ sr }) => {
      sr.goTo({ role: 'button', name: 'Apple' }).expect.spoken(/remove|delete/iu, {
         timeoutMs: 0,
      });
   });
});

describe('adding', () => {
   // WCAG 2.1.1 Keyboard: Enter adds the typed value as a tag.
   tagsInput('typing a value and pressing Enter adds a tag', ({ sr }) => {
      focusInput(sr)
         .type('Cherry')
         .press('Enter')
         .previous()
         .expect.spoken('end, Cherry, not current item');
   });

   // WCAG 4.1.3 Status Messages: a change the user did not focus should be announced.
   tagsInput('adding a tag is announced', ({ sr }) => {
      focusInput(sr)
         .type('Cherry')
         .checkpoint('add')
         .press('Enter')
         .expect.spoken(/Cherry/u, { since: 'add' });
   });
});

describe('removing', () => {
   // WCAG 2.1.1 Keyboard: the arrow keys pick a tag and Delete removes it.
   tagsInput('Left Arrow highlights the last tag and Delete removes it', ({ sr }) => {
      focusInput(sr)
         .press('ArrowLeft')
         .previous()
         .expect.spoken('end, Banana, current item')
         .next()
         .press('Delete')
         .previous()
         .expect.spoken('end, Apple, current item');
   });

   tagsInput(
      'Backspace on an empty field highlights the last tag, then removes it',
      ({ sr }) => {
         focusInput(sr)
            .press('Backspace')
            .previous()
            .expect.spoken('end, Banana, current item')
            .next()
            .press('Backspace')
            .previous()
            .expect.spoken('end, Apple, current item');
      },
   );
});
