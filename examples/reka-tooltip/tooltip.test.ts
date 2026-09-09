import { describe } from 'vitest';
import { test, type QueuedChain, type QueuedCommands } from 'a11ied/vitest';

/*
 * The tooltip demo on the Reka UI docs, read with the virtual screen reader. The APG has
 * no tooltip example, so each test names the WCAG criterion it covers instead.
 */
const TOOLTIP_URL = 'https://reka-ui.com/docs/components/tooltip';
const TOOLTIP_TEXT = 'Add to library';

const tooltip = test.extend({ srOptions: { url: TOOLTIP_URL } });

/** Tabs from the demo's code switch onto the trigger, which is the next stop. */
function focusTrigger(sr: QueuedCommands): QueuedChain<string> {
   return sr.goTo({ role: 'switch', name: 'View code' }).checkpoint('tab').press('Tab');
}

describe('opening', () => {
   // WCAG 1.4.13 Content on Hover or Focus, 2.1.1 Keyboard: focus alone shows it.
   tooltip('keyboard focus on the trigger opens the tooltip', ({ sr }) => {
      focusTrigger(sr).expect.spoken(`button, ${TOOLTIP_TEXT}`, { since: 'tab' });
   });

   // WCAG 4.1.2 Name, Role, Value: the tooltip text describes the trigger while open.
   tooltip('the tooltip text is read with the trigger', ({ sr }) => {
      focusTrigger(sr).expect.cursorOn({ role: 'button', name: TOOLTIP_TEXT });
   });
});

describe('dismissing', () => {
   // WCAG 1.4.13: dismissible with Escape, without moving focus.
   tooltip('Escape dismisses the tooltip and keeps focus on the trigger', ({ sr }) => {
      focusTrigger(sr)
         .checkpoint('escape')
         .press('Escape')
         .expect.cursorOn({ role: 'button' })
         .and.spoken(TOOLTIP_TEXT, { not: true, since: 'escape' });
   });
});

describe('leaving', () => {
   // APG tooltip pattern: a tooltip opened by focus is dismissed when focus leaves.
   tooltip('the tooltip closes when focus leaves the trigger', ({ sr }) => {
      focusTrigger(sr)
         .checkpoint('leave')
         .press('Tab')
         .previous()
         .expect.spoken(/^button$/u, { since: 'leave' });
   });
});

describe('the trigger', () => {
   // WCAG 4.1.2 Name, Role, Value: a button needs a name before its tooltip opens.
   tooltip('has an accessible name before the tooltip opens', ({ sr }) => {
      sr.goTo({ role: 'switch', name: 'View code' })
         .next()
         .expect.cursorOn({ role: 'button', name: TOOLTIP_TEXT }, { timeoutMs: 0 });
   });
});
