import { describe, expect, it, vi } from 'vitest';
import { createVirtualContextFixture } from './test-fixtures.js';
import { runBoundedLoop } from './broker-loops.js';

const MAX_STEPS = 3;

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
            const result = await runBoundedLoop({ adapter, max: MAX_STEPS, step });

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
