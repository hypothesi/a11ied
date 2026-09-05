import { test as base } from 'vitest';

import { screenReader, type ScreenReader, type ScreenReaderOptions } from '@a11ied/core';

import './extend.js';

export {
   isScreenReader,
   screenReaderMatchers,
   type ItemReceived,
   type MatcherOutcome,
   type SpokenReceived,
} from './matchers.js';
export * from '../test/index.js';

/** The fixtures `test` provides: the reader, and the options it is started with. */
export interface ScreenReaderFixtures {
   /** A reader started before the test and stopped after it. */
   sr: ScreenReader;
   /**
    * Options for that reader. Override them for a file or a block with `test.extend({
    * srOptions: { url } })` or `test.scoped({ srOptions: { url } })`.
    */
   srOptions: ScreenReaderOptions;
}

/**
 * Vitest's `test` with an `sr` fixture: a screen reader started before each test from
 * `srOptions` and stopped after it, whether the test passed or failed.
 *
 * @example
 *    import { expect } from 'vitest';
 *    import { test } from 'a11ied/vitest';
 *
 *    test('the pay button is announced', async ({ sr }) => {
 *       await sr.open('http://localhost:3000/checkout');
 *       await sr.goTo({ role: 'button', name: 'Pay' });
 *       await expect(sr).toBeOn({ role: 'button', name: 'Pay' });
 *    });
 */
export const test = base.extend<ScreenReaderFixtures>({
   srOptions: {},
   sr: async ({ srOptions }, use) => {
      const sr = await screenReader(srOptions);
      try {
         await use(sr);
      } finally {
         await sr.stop();
      }
   },
});

export { test as it };
