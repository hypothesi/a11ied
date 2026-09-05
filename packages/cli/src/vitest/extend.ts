import { expect } from 'vitest';

import type { WantedItem } from '../../../core/src/driver/broker-loops.js';
import type {
   SpokenMatch,
   SpokenOptions,
} from '../../../core/src/driver/spoken-matchers.js';
import { screenReaderMatchers } from './matchers.js';

/*
 * Importing this module installs the matchers on `expect` and adds their types to
 * Vitest's `Matchers` interface. Both `a11ied/vitest` and `a11ied/browser` import it.
 */
declare module 'vitest' {
   // Vitest declares the parameter as `T`, and an augmentation has to repeat that name.
   // oxlint-disable-next-line id-length
   interface Matchers<T> {
      /**
       * Passes when a phrase matches `match`: text without regard to case, or a RegExp.
       * `since` limits the check to phrases after a checkpoint. Await it on a reader.
       */
      toHaveSpoken(match: SpokenMatch, options?: SpokenOptions): T;
      /** Passes when each match is found after the previous one, other phrases between. */
      toHaveSpokenInOrder(
         matches: readonly SpokenMatch[],
         options?: Pick<SpokenOptions, 'since'>,
      ): T;
      /** Passes when the item under the cursor has the role, the name, or both. */
      toBeOn(wanted: WantedItem): T;
   }
}

expect.extend(screenReaderMatchers);
