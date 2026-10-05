import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriverAdapter } from '@a11ied/guidepup';
import type { BrokerHandlerContext } from './broker-types.js';
import { handleBrokerRequest } from './broker-handlers.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import { createContextTransport } from './screen-reader-context.js';

const adapters: DriverAdapter[] = [];

afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
});

async function createContext(): Promise<BrokerHandlerContext> {
   const { adapter, context } = await createVirtualContextFixture('wait-fixture');
   adapters.push(adapter);
   return context;
}

describe('driver wait scheduling', () => {
   it('allows library input to satisfy a broker wait', async () => {
      const context = await createContext(),
         phrases: string[] = [],
         state = await context.adapter.readState([]);
      const read = vi
         .spyOn(context.adapter, 'readState')
         .mockImplementation(async () => ({
            ...state,
            spokenPhraseLog: [...phrases],
            lastSpokenPhrase: phrases.at(-1),
         }));
      context.adapter.type = vi.fn(async () => {
         phrases.push('Submission complete');
      });
      const transport = createContextTransport({
         context,
         session: { sr: 'virtual', mode: 'in-process', engine: 'jsdom' },
         load: async () => ({ html: '', url: 'https://createdbyfireside.com/' }),
         stop: () => context.adapter.stop(),
      });
      const waiting = handleBrokerRequest(context, {
         command: 'action',
         action: 'wait',
         payload: { for: 'Submission complete', timeoutMs: 2000 },
      });
      await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1));
      await transport.run({ action: 'type', payload: { text: 'Fixture' } });
      const result = await waiting;

      expect(result.response.result?.details).toMatchObject({
         matched: true,
         phrase: 'Submission complete',
      });
   });

   it('ignores announcements produced before the wait began', async () => {
      const context = await createContext(),
         state = await context.adapter.readState([]);
      vi.spyOn(context.adapter, 'readState').mockResolvedValue({
         ...state,
         spokenPhraseLog: ['Submission complete'],
         lastSpokenPhrase: 'Submission complete',
      });
      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'wait',
         payload: { for: 'Submission complete', timeoutMs: 1 },
      });

      expect(result.response.result?.details).toMatchObject({
         matched: false,
         timedOut: true,
      });
   });
});

describe('checkpoint-scoped waits', () => {
   it('includes an announcement captured before wait but after the checkpoint', async () => {
      const context = await createContext(),
         state = await context.adapter.readState([]);
      context.transcript.addCheckpoint('submitted');
      vi.spyOn(context.adapter, 'readState').mockResolvedValue({
         ...state,
         spokenPhraseLog: ['Submission complete'],
         lastSpokenPhrase: 'Submission complete',
      });
      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'wait',
         payload: { for: 'Submission complete', since: 'submitted', timeoutMs: 1 },
      });

      expect(result.response.result?.details).toMatchObject({
         matched: true,
         phrase: 'Submission complete',
      });
   });

   it('rejects an unknown checkpoint instead of checking all history', async () => {
      const context = await createContext();
      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'wait',
         payload: { for: 'Submission complete', since: 'missing', timeoutMs: 1 },
      });

      expect(result.response.error?.code).toStrictEqual('checkpoint-not-found');
   });
});

describe('driver wait cancellation', () => {
   it.each(['phrase', 'pause'])(
      'cancels a library %s wait without reading after stop',
      async (kind) => {
         const context = await createContext(),
            read = vi.spyOn(context.adapter, 'readState'),
            transport = createContextTransport({
               context,
               session: { sr: 'virtual', mode: 'in-process', engine: 'jsdom' },
               load: async () => ({ html: '', url: 'https://createdbyfireside.com/' }),
               stop: () => context.adapter.stop(),
            });
         const payload =
            kind === 'phrase'
               ? { for: 'Absent announcement', timeoutMs: 30_000 }
               : { ms: 30_000 };
         const waiting = transport.run({ action: 'wait', payload });
         const rejected = expect(waiting).rejects.toMatchObject({
            code: 'session-stopping',
         });
         await vi.waitFor(() => expect(read).toHaveBeenCalled());
         await transport.stop();
         const readsAtStop = read.mock.calls.length;
         await rejected;

         expect(read).toHaveBeenCalledTimes(readsAtStop);
      },
   );
});
