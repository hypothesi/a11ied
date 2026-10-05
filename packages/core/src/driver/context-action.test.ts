import { once } from 'node:events';
import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriverAdapter } from '@a11ied/guidepup';
import * as guidepup from '@a11ied/guidepup';
import { cleanupTempRoots, withStateDir } from '../../../cli/src/testing/fixtures.js';
import { createBrokerServer, shutdownServer } from './broker-server.js';
import {
   hasInProcessSession,
   requestInProcess,
   startInProcessSession,
} from './runtime-internal.js';
import * as sessionContext from './session-context.js';
import { getActiveSessionFile } from './session-utils.js';
import * as sessionUtils from './session-utils.js';
import { handleBrokerRequest } from './broker-handlers.js';
import type { BrokerHandlerContext } from './broker-types.js';
import { closeContext } from './context-queue.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import { createContextTransport } from './screen-reader-context.js';
import {
   getActiveDriverSession,
   setVoiceOverLivenessCheckerForTesting,
} from './runtime.js';

const adapters: DriverAdapter[] = [];
const tempRoots: string[] = [];

afterEach(async () => {
   vi.useRealTimers();
   vi.restoreAllMocks();
   await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
   setVoiceOverLivenessCheckerForTesting(guidepup.isVoiceOverRunning);
   await cleanupTempRoots(tempRoots);
});

async function createContext(): Promise<BrokerHandlerContext> {
   const { adapter, context } = await createVirtualContextFixture('queue-fixture');
   adapters.push(adapter);
   return context;
}

async function openIdleClient(server: net.Server): Promise<net.Socket> {
   const accepted = once(server, 'connection');
   server.listen(0, '127.0.0.1');
   await once(server, 'listening');
   const address = server.address();
   if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP fixture server.');
   }
   const client = net.connect(address.port, '127.0.0.1');
   client.on('error', vi.fn());
   await Promise.all([once(client, 'connect'), accepted]);
   return client;
}

async function startInProcessFixture(
   target: 'virtual' | 'voiceover' = 'virtual',
): Promise<BrokerHandlerContext> {
   const context = await createContext();
   context.session.target = target;
   context.session.targetType = target === 'virtual' ? 'simulated' : 'real';
   context.session.metadataFile = getActiveSessionFile();
   vi.spyOn(sessionContext, 'createDriverSessionContext').mockResolvedValue({
      adapter: context.adapter,
      context,
   });
   await startInProcessSession({
      target,
      sessionId: context.session.sessionId,
   });
   return context;
}

describe('public driver shutdown boundaries', () => {
   it('closes idle broker connections without delaying input rejection or teardown', async () => {
      const context = await createContext(),
         server = createBrokerServer({ context, onStop: vi.fn(), onActivity: vi.fn() });
      const client = await openIdleClient(server),
         closed = new Promise<void>((resolvePromise) => {
            client.once('close', () => resolvePromise());
         }),
         press = vi.spyOn(context.adapter, 'press'),
         teardown = vi.spyOn(context.adapter, 'stop');
      try {
         const shutdown = shutdownServer(server, () => closeContext(context));
         const rejected = await handleBrokerRequest(context, {
            command: 'action',
            action: 'press',
            payload: { keys: ['Tab'] },
         });

         expect(rejected.response.error?.code).toStrictEqual('session-stopping');
         expect(press).not.toHaveBeenCalled();
         await Promise.all([shutdown, closed]);

         expect(teardown).toHaveBeenCalledTimes(1);
      } finally {
         client.destroy();
         server.close();
      }
   });
});

describe('in-process shutdown retry', () => {
   it('retries failed teardown through the public in-process stop path', async () => {
      await withStateDir(tempRoots, async () => {
         vi.spyOn(guidepup, 'isVoiceOverRunning').mockResolvedValue(true);
         const context = await startInProcessFixture('voiceover'),
            teardown = vi
               .spyOn(context.adapter, 'stop')
               .mockRejectedValueOnce(new Error('Reader busy'));
         const failed = await requestInProcess(context.session.sessionId, {
            command: 'stop',
         });

         expect(failed.ok).toStrictEqual(false);
         expect(failed.error?.message).toStrictEqual('Reader busy');
         expect(hasInProcessSession(context.session.sessionId)).toStrictEqual(true);
         setVoiceOverLivenessCheckerForTesting(async () => false);

         const active = await getActiveDriverSession();

         expect(active?.sessionId).toStrictEqual(context.session.sessionId);
         const rejected = await requestInProcess(context.session.sessionId, {
            command: 'status',
         });

         expect(rejected.error?.code).toStrictEqual('session-stopping');
         const stopped = await requestInProcess(context.session.sessionId, {
            command: 'stop',
         });

         expect(stopped.ok).toStrictEqual(true);
         expect(hasInProcessSession(context.session.sessionId)).toStrictEqual(false);
         expect(teardown.mock.calls).to.eql([[], []]);
      });
   });
});

describe('broker shutdown retry', () => {
   it('keeps a failed broker cleanup reachable for ping and a stop retry', async () => {
      const context = await createContext(),
         server = createBrokerServer({ context, onStop: vi.fn(), onActivity: vi.fn() });
      const client = await openIdleClient(server),
         teardown = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(new Error('Recorder busy'))
            .mockResolvedValue();
      try {
         await expect(
            shutdownServer(server, () => closeContext(context, teardown)),
         ).rejects.toThrow('Recorder busy');
         const reply = once(client, 'data');
         client.write(`${JSON.stringify({ command: 'ping' })}\n`);
         const [chunk] = await reply;

         expect(JSON.parse(String(chunk))).toMatchObject({
            ok: true,
            stopping: true,
            session: { sessionId: context.session.sessionId },
         });
         expect(server.listening).toStrictEqual(true);
         await shutdownServer(server, () => closeContext(context, teardown));

         expect(server.listening).toStrictEqual(false);
         expect(teardown.mock.calls).to.eql([[], []]);
      } finally {
         client.destroy();
         server.close();
      }
   });
});

describe('shared driver request serialization', () => {
   it('keeps concurrent client input and observations in order', async () => {
      const context = await createContext(),
         events: string[] = [];
      const release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolvePromise) => {
         release.mockImplementation(resolvePromise);
      });
      context.adapter.type = vi.fn(async () => {
         events.push('type');
         await blocked;
         events.push('typed');
      });
      context.adapter.press = vi.fn(async () => {
         events.push('press');
      });
      const transport = createContextTransport({
         context,
         session: { sr: 'virtual', mode: 'in-process', engine: 'jsdom' },
         load: async (document) => ({
            html: document.html ?? '',
            url: document.url ?? 'https://createdbyfireside.com/',
         }),
         stop: () => context.adapter.stop(),
      });
      const first = handleBrokerRequest(context, {
         command: 'action',
         action: 'type',
         payload: { text: 'Fixture' },
      });
      await vi.waitFor(() => expect(events).to.eql(['type']));
      const second = transport.run({ action: 'press', payload: { keys: ['Tab'] } });

      expect(events).to.eql(['type']);
      release();
      const results = await Promise.all([first, second]);

      expect(results[0]?.response.ok).toStrictEqual(true);
      expect(results[1]?.action).toStrictEqual('press');
      expect(events).to.eql(['type', 'typed', 'press']);
   });
});

describe('driver request recovery', () => {
   it('allows a later request after a rejected action', async () => {
      const context = await createContext();
      context.adapter.type = vi.fn().mockRejectedValue(new Error('Focus was lost.'));
      const failed = await handleBrokerRequest(context, {
         command: 'action',
         action: 'type',
         payload: { text: 'Fixture' },
      });
      const recovered = await handleBrokerRequest(context, { command: 'status' });

      expect(failed.response.ok).toStrictEqual(false);
      expect(recovered.response.ok).toStrictEqual(true);
   });
});

describe('driver shutdown ordering', () => {
   it('rejects input queued behind a broker stop before teardown begins', async () => {
      const context = await createContext(),
         press = vi.spyOn(context.adapter, 'press');
      const stop = handleBrokerRequest(context, { command: 'stop' });
      const input = handleBrokerRequest(context, {
         command: 'action',
         action: 'press',
         payload: { keys: ['Tab'] },
      });
      const [stopped, rejected] = await Promise.all([stop, input]);

      expect(stopped.shouldStop).toStrictEqual(true);
      expect(rejected.response.error?.code).toStrictEqual('session-stopping');
      expect(press).not.toHaveBeenCalled();
      await closeContext(context);
   });

   it('waits for running input and tears down once across callers', async () => {
      const context = await createContext(),
         events: string[] = [];
      const release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolvePromise) => {
         release.mockImplementation(resolvePromise);
      });
      context.adapter.type = vi.fn(async () => {
         events.push('input');
         await blocked;
         events.push('finished');
      });
      const teardown = vi.fn(async () => {
         events.push('stop');
      });
      const input = handleBrokerRequest(context, {
         command: 'action',
         action: 'type',
         payload: { text: 'Fixture' },
      });
      await vi.waitFor(() => expect(events).to.eql(['input']));
      const first = closeContext(context, teardown),
         second = closeContext(context, teardown);

      expect(first).toStrictEqual(second);
      expect(teardown).not.toHaveBeenCalled();
      release();
      await Promise.all([input, first, second]);

      expect(events).to.eql(['input', 'finished', 'stop']);
      expect(teardown).toHaveBeenCalledTimes(1);
   });
});

describe('driver shutdown recovery', () => {
   it('allows teardown retry while keeping input blocked', async () => {
      const context = await createContext(),
         teardown = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(new Error('Reader unavailable'))
            .mockResolvedValue();
      await expect(closeContext(context, teardown)).rejects.toThrow('Reader unavailable');
      const input = await handleBrokerRequest(context, { command: 'status' });

      expect(input.response.error?.code).toStrictEqual('session-stopping');
      await closeContext(context, teardown);
      await closeContext(context, teardown);

      expect(teardown.mock.calls).to.eql([[], []]);
   });

   it('still requests teardown if the final observation fails', async () => {
      const context = await createContext();
      vi.spyOn(context.adapter, 'readState').mockRejectedValue(
         new Error('Reader disappeared'),
      );
      const stopped = await handleBrokerRequest(context, { command: 'stop' });

      expect(stopped.response.ok).toStrictEqual(false);
      expect(stopped.shouldStop).toStrictEqual(true);
      await closeContext(context);
   });
});

describe('monitor shutdown recovery', () => {
   it('retries interrupted cleanup once across a monitor and public stop after the reader returns', async () => {
      await withStateDir(tempRoots, async () => {
         const checker = vi
            .spyOn(guidepup, 'isVoiceOverRunning')
            .mockResolvedValue(false);
         vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
         const context = await startInProcessFixture('voiceover'),
            removed = vi.spyOn(sessionUtils, 'removeSessionArtifacts'),
            teardown = vi
               .spyOn(context.adapter, 'stop')
               .mockRejectedValueOnce(new Error('Reader busy'));
         const monitorIntervalMs = 1000;
         await vi.advanceTimersByTimeAsync(monitorIntervalMs);

         expect(context.stopping).toStrictEqual(true);
         checker.mockResolvedValue(true);
         const stopped = requestInProcess(context.session.sessionId, { command: 'stop' });
         await vi.advanceTimersByTimeAsync(monitorIntervalMs);
         const response = await stopped;

         expect(response.ok).toStrictEqual(true);
         expect(hasInProcessSession(context.session.sessionId)).toStrictEqual(false);
         expect(teardown.mock.calls).to.eql([[], []]);
         expect(removed).toHaveBeenCalledTimes(1);
      });
   });
});
