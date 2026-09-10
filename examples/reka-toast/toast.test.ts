import { describe } from 'vitest';
import { test, type QueuedChain, type QueuedCommands } from 'a11ied/vitest';

/*
 * The toast demo on the Reka UI docs, read with the virtual screen reader. The closest
 * APG pattern is Alert (`a1 pattern alert`), which is a live region and nothing more, so
 * each test names the WCAG criterion it covers instead.
 */
const TOAST_URL = 'https://reka-ui.com/docs/components/toast';
const TRIGGER = 'Add to calendar';
const TOAST_TEXT = /Scheduled: Catch up/u;
/**
 * How long the toast gets to appear. The notifications hotkey and Escape act on the
 * toasts present at the time, and the toast mounts a moment after the press.
 */
const TOAST_SETTLE_MS = 500;
/** Longer than the five seconds the demo gives a toast before it removes it. */
const LONGER_THAN_THE_TOAST_MS = 7000;

const toast = test.extend({ srOptions: { url: TOAST_URL } });

/** Presses the trigger, leaving a checkpoint at the press. */
function addToCalendar(sr: QueuedCommands): QueuedChain<string> {
   return sr
      .goTo({ role: 'button', name: TRIGGER })
      .checkpoint('add')
      .press('Enter')
      .wait({ ms: TOAST_SETTLE_MS });
}

describe('announcing', () => {
   // WCAG 4.1.3 Status Messages: a toast is a status message, announced without focus.
   toast('pressing the trigger announces the toast', ({ sr }) => {
      addToCalendar(sr).expect.spoken(TOAST_TEXT, { since: 'add' });
   });
});

describe('focus', () => {
   // APG alert pattern: an alert must not affect keyboard focus. WCAG 2.4.3 Focus Order.
   toast('the toast does not take keyboard focus', ({ sr }) => {
      addToCalendar(sr).expect.cursorOn({ role: 'button', name: TRIGGER });
   });
});

describe('staying', () => {
   // APG alert pattern: avoid alerts that disappear on their own. WCAG 2.2.1 Timing Adjustable.
   toast('the toast stays until the user dismisses it', ({ sr }) => {
      addToCalendar(sr)
         .wait({ ms: LONGER_THAN_THE_TOAST_MS })
         .press('F8', 'Tab')
         .expect.cursorOn({ role: 'listitem' }, { timeoutMs: 0 });
   });
});

describe('reaching the toast', () => {
   // WCAG 2.1.1 Keyboard, 2.4.3 Focus Order: the hotkey moves focus to the notifications.
   toast('F8 moves focus to the notifications and Tab reaches the toast', ({ sr }) => {
      addToCalendar(sr)
         .press('F8')
         .expect.cursorOn({ role: 'list' })
         .press('Tab')
         .expect.cursorOn({ role: 'listitem' })
         .next()
         .expect.spoken(TOAST_TEXT, { since: 'add' });
   });

   // WCAG 2.1.1 Keyboard: the action inside the toast is a button in the Tab sequence.
   toast('Tab reaches the Undo button inside the toast', ({ sr }) => {
      addToCalendar(sr)
         .press('F8', 'Tab', 'Tab')
         .expect.cursorOn({ role: 'button', name: 'Undo' });
   });
});

describe('dismissing', () => {
   // WCAG 2.1.1 Keyboard: Escape closes the toast, so F8 lands on an empty list.
   toast('Escape closes the toast', ({ sr }) => {
      addToCalendar(sr)
         .press('F8', 'Tab')
         .checkpoint('escape')
         .press('Escape')
         .wait({ ms: TOAST_SETTLE_MS })
         .press('F8')
         .next()
         .expect.spoken(/^listitem/u, { not: true, since: 'escape' });
   });
});
