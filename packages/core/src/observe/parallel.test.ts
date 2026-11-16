import { describe, expect, it } from 'vitest';
import {
   DEFAULT_OBSERVATION_CONCURRENCY,
   mapWithConcurrency,
   observeTargetsInParallel,
   type ObserveTargetInput,
} from './parallel.js';

const TARGET_COUNT = 10;
const DELAY_STEP_MS = 5;
const TEST_CONCURRENCY = 4;
const EXPECTED_DEFAULT_CONCURRENCY = 4;
const FRACTIONAL_CONCURRENCY = 1.5;

const TARGET_URLS = Array.from(
   { length: TARGET_COUNT },
   (_unused, index) => `https://shop.test/${String(index)}`,
);

const ORDERED_INDEXES = Array.from({ length: TARGET_COUNT }, (_unused, index) => index);
const INVALID_CONCURRENCY = [0, -1, FRACTIONAL_CONCURRENCY];

function delay(ms: number): Promise<void> {
   return new Promise((resolve) => {
      setTimeout(resolve, ms);
   });
}

function buildTargets(): ObserveTargetInput[] {
   return TARGET_URLS.map((targetUrl) => ({ targetUrl }));
}

describe('observeTargetsInParallel', () => {
   it('runs a 10-target workload with concurrency: 4, never exceeding 4 active tasks and preserving deterministic input order', async () => {
      const targets = buildTargets();

      let activeCount = 0;
      let maxActiveCount = 0;

      const results = await observeTargetsInParallel(targets, {
         concurrency: TEST_CONCURRENCY,
         observeTarget: async (_target, index) => {
            activeCount += 1;
            if (activeCount > maxActiveCount) {
               maxActiveCount = activeCount;
            }
            // Later items finish faster so a naive implementation would scramble order.
            await delay((TARGET_COUNT - index) * DELAY_STEP_MS);
            activeCount -= 1;

            return { index };
         },
      });

      expect(maxActiveCount <= TEST_CONCURRENCY).toStrictEqual(true);
      expect(maxActiveCount > 1).toStrictEqual(true);
      expect(results.map((result) => result.index)).toStrictEqual(ORDERED_INDEXES);
   });

   it('uses DEFAULT_OBSERVATION_CONCURRENCY when concurrency is omitted', async () => {
      const targets = buildTargets();

      let activeCount = 0;
      let maxActiveCount = 0;

      const results = await observeTargetsInParallel(targets, {
         observeTarget: async (_target, index) => {
            activeCount += 1;
            if (activeCount > maxActiveCount) {
               maxActiveCount = activeCount;
            }
            await delay((TARGET_COUNT - index) * DELAY_STEP_MS);
            activeCount -= 1;

            return { index };
         },
      });

      expect(DEFAULT_OBSERVATION_CONCURRENCY).toStrictEqual(EXPECTED_DEFAULT_CONCURRENCY);
      expect(maxActiveCount <= DEFAULT_OBSERVATION_CONCURRENCY).toStrictEqual(true);
      expect(maxActiveCount > 1).toStrictEqual(true);
      expect(results.map((result) => result.index)).toStrictEqual(ORDERED_INDEXES);
   });

   it('returns an empty array for an empty target list', async () => {
      const results = await observeTargetsInParallel<
         ObserveTargetInput,
         { index: number }
      >([], {
         observeTarget: async () => ({ index: -1 }),
      });

      expect(results).toStrictEqual([]);
   });

   it('throws a RangeError for invalid concurrency values', async () => {
      await Promise.all(
         INVALID_CONCURRENCY.map(async (concurrency) => {
            try {
               await mapWithConcurrency(['a', 'b'], concurrency, async (item) => item);
               expect.unreachable('expected RangeError');
            } catch (error) {
               if (!(error instanceof RangeError)) {
                  throw error;
               }

               expect(error.message).toStrictEqual(
                  'concurrency must be a positive integer',
               );
            }
         }),
      );
   });
});
