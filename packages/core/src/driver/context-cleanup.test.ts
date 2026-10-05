import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionRecordingSchema } from '@a11ied/contracts';
import type { DriverAdapter } from '@a11ied/guidepup';
import type { BrokerHandlerContext } from './broker-types.js';
import { createDriverSessionContext, stopSessionResources } from './session-context.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const adapters: DriverAdapter[] = [];

afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
});

async function createContext(): Promise<BrokerHandlerContext> {
   const { adapter, context } = await createVirtualContextFixture('cleanup-fixture');
   adapters.push(adapter);
   return context;
}

describe('recording cleanup', () => {
   it('retains desktop ownership when recording shutdown is unconfirmed', async () => {
      const context = await createContext(),
         finish = vi.fn(async () => {
            throw new Error('Recording cleanup failed');
         }),
         stop = vi.spyOn(context.adapter, 'stop');

      await expect(stopSessionResources(context.adapter, finish)).rejects.toThrow(
         'Recording cleanup failed',
      );

      expect(finish).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
   });

   it('finishes recording before reader shutdown and finalization', async () => {
      const context = await createContext(),
         events: string[] = [],
         finalized = vi.fn(async () => {
            events.push('finalized');
         }),
         finish = vi.fn(async () => {
            events.push('recording');
         });
      vi.spyOn(context.adapter, 'stop').mockImplementation(async () => {
         events.push('reader');
      });

      await stopSessionResources(context.adapter, finish, finalized);

      expect(events).to.eql(['recording', 'reader', 'finalized']);
   });
});

describe('missing recording artifacts', () => {
   it('finalizes confirmed shutdown while reporting missing output', async () => {
      const context = await createContext(),
         finalized = vi.fn<() => Promise<void>>().mockResolvedValue(),
         missing = new CliEnvironmentError(
            'recording-file-missing',
            'Recording output is missing.',
         );
      const finish = vi.fn<() => Promise<unknown>>().mockRejectedValue(missing);

      await expect(
         stopSessionResources(context.adapter, finish, finalized),
      ).rejects.toStrictEqual(missing);

      expect(finalized).toHaveBeenCalledTimes(1);
   });

   it('does not retry a stopped recorder after artifact validation fails', async () => {
      const metadata = sessionRecordingSchema.parse({
            path: '/tmp/missing.mov',
            format: 'mov',
            status: 'failed',
            startedAt: new Date().toISOString(),
         }),
         stop = vi
            .fn<() => Promise<typeof metadata>>()
            .mockRejectedValue(
               new CliEnvironmentError(
                  'recording-file-missing',
                  'Recording output is missing.',
               ),
            );
      const { adapter, context } = await createDriverSessionContext({
         target: 'virtual',
         sessionId: 'missing-artifact',
         metadataFile: 'in-memory://missing-artifact',
         socketPath: 'in-memory://missing-artifact',
         persist: false,
         engine: 'jsdom',
         recording: { metadata, stop },
      });
      adapters.push(adapter);

      await expect(context.finishRecording?.()).rejects.toMatchObject({
         code: 'recording-file-missing',
      });
      await expect(context.finishRecording?.()).resolves.toMatchObject({
         status: 'failed',
      });

      expect(stop).toHaveBeenCalledTimes(1);
   });
});

describe('cleanup failure reporting', () => {
   it('preserves artifact and metadata finalization failures together', async () => {
      const context = await createContext(),
         metadata = new Error('Metadata removal failed'),
         missing = new CliEnvironmentError('recording-file-missing', 'Missing output');
      const finalized = vi.fn<() => Promise<void>>().mockRejectedValue(metadata),
         finish = vi.fn<() => Promise<unknown>>().mockRejectedValue(missing);

      await expect(
         stopSessionResources(context.adapter, finish, finalized),
      ).rejects.toMatchObject({
         errors: [missing, metadata],
      });
   });
});
