import { describe } from 'vitest';
import { test, type QueuedChain, type QueuedCommands } from 'a11ied/vitest';

/*
 * The dialog demo on the Reka UI docs, read with the virtual screen reader. Each test
 * names the row of the ARIA Authoring Practices Guide (APG) modal dialog example it
 * covers (`a1 pattern dialog`) and the WCAG criterion that row serves.
 */
const DIALOG_URL = 'https://reka-ui.com/docs/components/dialog';
const TITLE = 'Edit profile',
   TRIGGER = 'Edit profile';
const DESCRIPTION = "Make changes to your profile here. Click save when you're done.";
const TRIGGER_PHRASE = `button, ${TRIGGER}, not expanded, has popup dialog`;

const dialog = test.extend({ srOptions: { url: DIALOG_URL } });

/** Moves to the trigger and opens the dialog, leaving a checkpoint at the press. */
function openDialog(sr: QueuedCommands): QueuedChain<string> {
   return sr.goTo({ role: 'button', name: TRIGGER }).checkpoint('open').press('Enter');
}

describe('opening', () => {
   // WCAG 4.1.2 Name, Role, Value: the trigger says what it opens.
   dialog('the trigger says it opens a dialog', ({ sr }) => {
      sr.goTo({ role: 'button', name: TRIGGER }).expect.spoken(TRIGGER_PHRASE);
   });

   // APG dialog-role, aria-labelledby, aria-describedby. WCAG 4.1.2, 1.3.1.
   dialog('the dialog is named by its title and described by its text', ({ sr }) => {
      openDialog(sr).expect.spoken(`dialog, ${TITLE}, ${DESCRIPTION}`, { since: 'open' });
   });

   // WCAG 2.4.3 Focus Order: focus moves into the dialog when it opens.
   dialog('focus moves to the first field inside the dialog', ({ sr }) => {
      openDialog(sr).expect.cursorOn({ role: 'textbox', name: 'Name' });
   });

   // WCAG 1.3.1, 2.4.6: the title is a heading inside the dialog.
   dialog('the title is a level 2 heading', ({ sr }) => {
      openDialog(sr)
         .top()
         .goTo({ role: 'heading', name: TITLE })
         .expect.spoken(`heading, ${TITLE}, level 2`, { since: 'open' });
   });
});

describe('keyboard', () => {
   // APG key-tab. WCAG 2.1.1 Keyboard, 2.4.3 Focus Order.
   dialog('Tab stays inside the dialog and wraps to the first control', ({ sr }) => {
      openDialog(sr)
         .press('Tab')
         .expect.cursorOn({ role: 'textbox', name: 'Username' })
         .press('Tab')
         .expect.cursorOn({ role: 'button', name: 'Save changes' })
         .press('Tab')
         .expect.cursorOn({ role: 'button', name: 'Close' })
         .press('Tab')
         .expect.cursorOn({ role: 'textbox', name: 'Name' });
   });

   // APG key-shift-tab. WCAG 2.1.1 Keyboard, 2.4.3 Focus Order.
   dialog('Shift+Tab wraps from the first control to the last', ({ sr }) => {
      openDialog(sr)
         .press('Shift+Tab')
         .expect.cursorOn({ role: 'button', name: 'Close' });
   });

   // APG key-escape. WCAG 2.1.1 Keyboard, 2.4.3 Focus Order.
   dialog('Escape closes the dialog and returns focus to the trigger', ({ sr }) => {
      openDialog(sr)
         .checkpoint('escape')
         .press('Escape')
         .expect.cursorOn({ role: 'button', name: TRIGGER })
         .and.spoken(TRIGGER_PHRASE, { since: 'escape' });
   });

   // WCAG 2.1.1 Keyboard: the close button works from the keyboard too.
   dialog('the Close button closes the dialog and returns focus', ({ sr }) => {
      openDialog(sr)
         .goTo({ role: 'button', name: 'Close' })
         .checkpoint('close')
         .press('Enter')
         .expect.cursorOn({ role: 'button', name: TRIGGER })
         .and.spoken(TRIGGER_PHRASE, { since: 'close' });
   });
});

describe('what the dialog holds', () => {
   // APG: all elements required to operate the dialog are descendants of it. WCAG 1.3.1.
   dialog('every control the dialog needs is inside it', ({ sr }) => {
      openDialog(sr)
         .readAll()
         .expect.spokenInOrder(
            [
               'textbox, Name',
               'textbox, Username',
               'button, Save changes',
               'button, Close',
               `end of dialog, ${TITLE}`,
            ],
            { since: 'open' },
         );
   });
});

describe('the rest of the page', () => {
   // APG aria-modal: the demo hides the page with aria-hidden instead. WCAG 2.4.3.
   dialog('is hidden from the reader while the dialog is open', ({ sr }) => {
      openDialog(sr)
         .goTo({ role: 'button', name: 'Close' })
         .next()
         .next()
         .expect.spokenInOrder(
            ['button, Close', `end of dialog, ${TITLE}`, 'end of document'],
            {
               since: 'open',
            },
         );
   });
});
