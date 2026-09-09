import { test as base } from 'vitest';

import {
   screenReader,
   type QueuedScreenReader,
   type ScreenReaderOptions,
} from '@a11ied/core';

import './extend.js';
import { createScreenReaderFixture } from './fixture.js';

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
   /**
    * A reader started before the test and stopped after it. Its methods queue: call them
    * without `await`, and await only a call whose value the test needs.
    */
   sr: QueuedScreenReader;
   /**
    * Options for that reader. Override them for a file or a block with `test.extend({
    * srOptions: { url } })` or `test.scoped({ srOptions: { url } })`.
    */
   srOptions: ScreenReaderOptions;
}

/**
 * Vitest's `test` with an `sr` fixture: a screen reader started before each test from
 * `srOptions` and stopped after it, whether the test passed or failed. The reader's
 * methods queue, so the test needs no `await` unless it reads a value.
 *
 * @example
 *    import { test } from 'a11ied/vitest';
 *
 *    test('the pay button is announced', ({ sr }) => {
 *       sr.open('http://localhost:3000/checkout');
 *       sr.goTo({ role: 'button', name: 'Pay' });
 *       sr.expectCursorOn({ role: 'button', name: 'Pay' });
 *    });
 */
export const test = base.extend<ScreenReaderFixtures>({
   srOptions: {},
   sr: createScreenReaderFixture(screenReader),
});

export { test as it };
