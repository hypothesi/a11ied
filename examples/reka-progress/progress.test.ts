import { describe } from 'vitest';
import { test } from 'a11ied/vitest';

/*
 * The progress demo on the Reka UI docs, read with the virtual screen reader. The APG has
 * no progress bar example, so each test names the WCAG criterion it covers instead.
 */
const PROGRESS_URL = 'https://reka-ui.com/docs/components/progress';
const PROGRESS_PHRASE =
   /^progressbar, \d+%, max value 100, min value 0, current value \d+%$/u;
const LATER_MS = 3000;

const progress = test.extend({ srOptions: { url: PROGRESS_URL } });

describe('the progress bar', () => {
   // WCAG 4.1.2 Name, Role, Value: role, range, and current value are all exposed.
   progress('announces its role, name, range, and current value', ({ sr }) => {
      sr.goTo({ role: 'progressbar' }).expect.spoken(PROGRESS_PHRASE);
   });

   // WCAG 1.3.1 Info and Relationships: the name states the value the bar holds.
   progress('is named by its percentage', ({ sr }) => {
      sr.goTo({ role: 'progressbar' }).expect.cursorOn({
         role: 'progressbar',
         name: '%',
      });
   });

   // WCAG 4.1.2: the exposed value follows the bar as it advances.
   progress('reports a higher value after it advances', ({ sr }) => {
      sr.goTo({ role: 'progressbar' })
         .expect.spoken(/current value 10%/u)
         .checkpoint('later')
         .wait({ ms: LATER_MS })
         // The bar re-renders as its value moves, so the reader finds it again from the top.
         .top()
         .goTo({ role: 'progressbar' })
         .expect.spoken(/current value (40|70|100)%/u, { since: 'later' });
   });
});
