import { describe, expect, it, vi } from 'vitest';

import { handleBrokerRequest } from './broker-handlers.js';
import { createVirtualContextFixture } from './test-fixtures.js';

describe('stopping a session during a bounded loop', () => {
   it('does not queue stop behind a read-all step that never returns', async () => {
      const { adapter, context } = await createVirtualContextFixture('hung-read-all');
      const navigate = vi.spyOn(adapter, 'navigate').mockReturnValue(
         new Promise<never>(() => {
            // The reader never answers.
         }),
      );

      const readAll = handleBrokerRequest(context, {
         command: 'action',
         action: 'read-all',
         payload: { max: 500 },
      });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      const stopped = await handleBrokerRequest(context, { command: 'stop' });
      const interrupted = await readAll;

      expect(stopped.response.ok).toStrictEqual(true);
      expect(stopped.shouldStop).toStrictEqual(true);
      expect(interrupted.response.error?.code).toStrictEqual('session-stopping');
   });
});
