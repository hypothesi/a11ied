import type { RunnerTestCase } from 'vitest';

import {
   queueScreenReader,
   type QueuedScreenReader,
} from '../../../core/src/driver/queued-screen-reader.js';
import type { ScreenReader } from '../../../core/src/driver/screen-reader.js';

interface FixtureContext<Options> {
   srOptions: Options;
   task: Readonly<RunnerTestCase>;
   signal: AbortSignal;
}

type Fixture<Options> = (
   context: FixtureContext<Options>,
   use: (sr: QueuedScreenReader) => Promise<void>,
) => Promise<void>;

function promiseListOf(task: Readonly<RunnerTestCase>): Promise<unknown>[] {
   if (task.promises === undefined) {
      // `task` is typed read-only, and the runner creates this array on demand too.
      Object.defineProperty(task, 'promises', {
         value: [],
         writable: true,
         configurable: true,
         enumerable: true,
      });
   }
   const promises = task.promises;
   if (promises === undefined) {
      throw new Error('The test task refused a promises list.');
   }
   return promises;
}

/**
 * Records a command's settled promise on the test task. After the test function returns,
 * the runner awaits `task.promises` and reports each rejection as an error of the test
 * itself, the same way it reports an unawaited `expect().resolves`.
 */
export function recordOnTask(
   task: Readonly<RunnerTestCase>,
   promise: Promise<void>,
): void {
   promiseListOf(task).push(promise);
}

function forgetOnTask(task: Readonly<RunnerTestCase>, recorded: Promise<void>[]): void {
   const promises = task.promises ?? [];
   for (const promise of recorded) {
      const index = promises.indexOf(promise);
      if (index !== -1) {
         promises.splice(index, 1);
      }
   }
}

/**
 * Builds the `sr` fixture for `test.extend`: a reader started from `srOptions` by
 * `start`, wrapped in a command queue, and stopped after the test. Each queued command is
 * recorded on the test task, so a failure nobody awaited fails the test from inside the
 * test body. The test's abort signal skips every command not yet started once the test
 * times out.
 */
export function createScreenReaderFixture<Options>(
   start: (options: Options) => Promise<ScreenReader>,
): Fixture<Options> {
   return async ({ srOptions, task, signal }, use) => {
      const recorded: Promise<void>[] = [];
      const sr = queueScreenReader(await start(srOptions), {
         track: (settled): void => {
            recorded.push(settled);
            recordOnTask(task, settled);
         },
         signal,
      });
      try {
         await use(sr);
      } finally {
         await sr.stop();
         forgetOnTask(task, recorded);
      }
   };
}
