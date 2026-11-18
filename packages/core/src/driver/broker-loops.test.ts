import { describe, expect, it, vi } from 'vitest';
import { createVirtualContextFixture } from './test-fixtures.js';
import { runBoundedLoop } from './broker-loops.js';

const MAX_STEPS = 3,
   STUCK_MAX_STEPS = 50;

describe('bounded reader navigation', () => {
   it.each(['Same label', 'No more results'])(
      'does not treat real spoken text as cursor identity: %s',
      async (phrase) => {
         const { adapter } = await createVirtualContextFixture('duplicate-labels');
         adapter.target = 'voiceover';
         vi.spyOn(adapter, 'readCurrentItem').mockResolvedValue({
            item: { phrase, states: [], source: 'speech' },
            position: phrase,
         });
         const step = vi.fn(async () => ({}));
         try {
            const result = await runBoundedLoop({
               adapter,
               max: MAX_STEPS,
               step,
            });

            expect(result.stoppedAt).toStrictEqual('cap');
            expect(result.complete).toStrictEqual(false);
            expect(result.items).toHaveLength(MAX_STEPS);
            expect(result.limitations).not.toHaveLength(0);
            expect(step).toHaveBeenCalledTimes(MAX_STEPS);
         } finally {
            await adapter.stop();
         }
      },
   );

   it('stops a real reader that keeps announcing the same item, and marks it incomplete', async () => {
      const { adapter } = await createVirtualContextFixture('stuck-cursor');
      adapter.target = 'voiceover';
      vi.spyOn(adapter, 'readCurrentItem').mockResolvedValue({
         item: { phrase: 'Sign in button', states: [], source: 'speech' },
         position: 'Sign in button',
      });
      try {
         const result = await runBoundedLoop({
            adapter,
            max: STUCK_MAX_STEPS,
            step: async () => ({}),
         });

         expect(result.stoppedAt).toStrictEqual('stalled');
         expect(result.complete).toStrictEqual(false);
         expect(result.items).toHaveLength(1);
      } finally {
         await adapter.stop();
      }
   });

   it('stops a real reader that alternates its last item with silence', async () => {
      const { adapter } = await createVirtualContextFixture('alternating-end');
      adapter.target = 'voiceover';
      vi.spyOn(adapter, 'readCurrentItem')
         .mockResolvedValueOnce({
            item: { phrase: 'start', states: [], source: 'speech' },
            position: 'start',
         })
         .mockResolvedValueOnce({
            item: {
               phrase: 'heading level 1 Title',
               states: [],
               source: 'speech',
            },
            position: 'a',
         })
         .mockResolvedValue({
            item: { phrase: '', states: [], source: 'speech' },
            position: '',
         });
      try {
         const result = await runBoundedLoop({
            adapter,
            max: STUCK_MAX_STEPS,
            step: async () => ({}),
         });

         expect(result.stoppedAt).toStrictEqual('stalled');
         expect(result.items.length).toBeLessThan(STUCK_MAX_STEPS);
      } finally {
         await adapter.stop();
      }
   });

   it('accepts confirmed adapter movement limits', async () => {
      const { adapter } = await createVirtualContextFixture('confirmed-end');
      adapter.target = 'nvda';
      try {
         const result = await runBoundedLoop({
            adapter,
            max: MAX_STEPS,
            step: async () => ({ moved: false }),
         });

         expect(result.stoppedAt).toStrictEqual('end');
         expect(result.complete).toStrictEqual(true);
      } finally {
         await adapter.stop();
      }
   });
});

describe('time-limited reader navigation', () => {
   it('returns the items read so far once the time budget passes', async () => {
      const { adapter } = await createVirtualContextFixture('out-of-time');
      adapter.target = 'voiceover';
      vi.spyOn(adapter, 'readCurrentItem').mockResolvedValue({
         item: { phrase: 'Link', states: [], source: 'speech' },
         position: 'Link',
      });
      try {
         const result = await runBoundedLoop({
            adapter,
            max: MAX_STEPS,
            budgetMs: 0,
            step: async () => ({}),
         });

         expect(result.stoppedAt).toStrictEqual('time');
         expect(result.complete).toStrictEqual(false);
         expect(result.items).toEqual([]);
      } finally {
         await adapter.stop();
      }
   });
});

describe('cancelled reader navigation', () => {
   it('abandons a step that never returns once the signal aborts', async () => {
      const { adapter } = await createVirtualContextFixture('hung-step');
      const controller = new AbortController(),
         reason = new Error('The session is stopping.');
      try {
         const looping = runBoundedLoop({
            adapter,
            max: MAX_STEPS,
            step: () =>
               new Promise<never>(() => {
                  // The reader never answers.
               }),
            signal: controller.signal,
         });
         controller.abort(reason);

         await expect(looping).rejects.toBe(reason);
      } finally {
         await adapter.stop();
      }
   });
});
