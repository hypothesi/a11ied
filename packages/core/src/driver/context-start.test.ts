import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionRecordingSchema } from '@a11ied/contracts';
import * as guidepup from '@a11ied/guidepup';
import type { DriverAdapter } from '@a11ied/guidepup';
import type { BrokerHandlerContext } from './broker-types.js';
import * as browserLaunch from './browser-launch.js';
import { handleBrokerRequest } from './broker-handlers.js';
import * as recording from './recording.js';
import {
   createDriverSessionContext,
   initializeSessionTarget,
} from './session-context.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import * as virtualHost from './virtual-host-choice.js';
import { createContextTransport } from './screen-reader-context.js';

const adapters: DriverAdapter[] = [];

afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
});

async function createContext(): Promise<BrokerHandlerContext> {
   const { adapter, context } = await createVirtualContextFixture('startup-fixture');
   adapters.push(adapter);
   return context;
}

describe('virtual document attachment', () => {
   it('records the opened URL without opening a native browser', async () => {
      const context = await createContext();
      const attach = vi.spyOn(context.adapter, 'attachDocument'),
         open = vi.spyOn(browserLaunch, 'openUrlInBrowser'),
         url = 'https://createdbyfireside.com/';
      const result = await handleBrokerRequest(context, {
         command: 'attach-document',
         payload: { html: '<p>Hi</p>', url },
      });

      expect(attach).toHaveBeenCalledWith({ html: '<p>Hi</p>', url });
      expect(result.response.result?.session.url).toBe(url);
      expect(open).not.toHaveBeenCalled();
   });
});

describe('owned real-target startup', () => {
   it('opens and records only after startup, and cleans both on a later failure', async () => {
      const context = await createContext(),
         events: string[] = [],
         metadata = sessionRecordingSchema.parse({
            path: '/tmp/startup.mov',
            format: 'mov',
            status: 'active',
            startedAt: new Date().toISOString(),
         });
      vi.spyOn(guidepup, 'createDriverAdapter').mockReturnValue(context.adapter);
      vi.spyOn(context.adapter, 'start').mockImplementation(async () => {
         events.push('start');
      });
      vi.spyOn(browserLaunch, 'openUrlInBrowser').mockImplementation(async () => {
         events.push('open');
         return { focusTarget: { appName: 'Safari' }, warnings: [] };
      });
      vi.spyOn(context.adapter, 'focus').mockImplementation(async (target) => {
         events.push('focus');
         return { status: 'focused', target, platform: 'voiceover' };
      });
      vi.spyOn(guidepup, 'waitForWindowFocus').mockResolvedValue({
         focused: true,
         waitedMs: 0,
      });
      const stopRecording = vi.fn(async () => metadata);
      vi.spyOn(recording, 'startSessionRecording').mockImplementation(() => {
         events.push('record');
         return { metadata, stop: stopRecording };
      });
      vi.spyOn(context.adapter, 'readState').mockRejectedValue(
         new Error('Observation failed'),
      );
      const stop = vi.spyOn(context.adapter, 'stop');

      await expect(
         createDriverSessionContext({
            target: 'voiceover',
            sessionId: 'owned-start',
            metadataFile: 'in-memory://owned-start',
            socketPath: 'in-memory://owned-start',
            persist: false,
            url: 'https://createdbyfireside.com/',
            browser: 'Safari',
            recordingPath: metadata.path,
         }),
      ).rejects.toThrow('Observation failed');

      expect(events).to.eql(['start', 'open', 'focus', 'record']);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(stopRecording).toHaveBeenCalledTimes(1);
   });
});

describe('shared real-target navigation', () => {
   it.each([true, false])(
      'updates the document only after focus confirmation: %s',
      async (focused) => {
         const app = { appName: 'Safari' },
            context = await createContext(),
            events: string[] = [],
            previousURL = 'https://createdbyfireside.com/',
            url = 'https://createdbyfireside.com/contact/';
         context.session = {
            ...context.session,
            target: 'voiceover',
            targetType: 'real',
            url: previousURL,
            app,
            browser: 'Safari',
         };
         vi.spyOn(browserLaunch, 'openUrlInBrowser').mockImplementation(async () => {
            events.push('open');
            return { focusTarget: app };
         });
         vi.spyOn(context.adapter, 'focus').mockImplementation(async (target) => {
            events.push('focus');
            return { status: 'focused', target, platform: 'voiceover' };
         });
         vi.spyOn(guidepup, 'waitForWindowFocus').mockResolvedValue({
            focused,
            waitedMs: 0,
         });
         const attach = vi
            .spyOn(context.adapter, 'attachDocument')
            .mockImplementation(async () => {
               events.push('attach');
            });
         const result = await handleBrokerRequest(context, {
            command: 'attach-document',
            payload: { html: '', url },
         });

         expect(events).to.eql(focused ? ['open', 'focus', 'attach'] : ['open', 'focus']);
         expect(result.response.ok).toStrictEqual(focused);
         expect(result.shouldStop).toStrictEqual(!focused);
         expect(context.stopping ?? false).toStrictEqual(!focused);
         expect(context.session.url).toStrictEqual(focused ? url : previousURL);
         expect(attach).toHaveBeenCalledTimes(focused ? 1 : 0);
         expect(browserLaunch.openUrlInBrowser).toHaveBeenCalledWith(url, 'Safari');
      },
   );
});

describe('navigation ownership and browser selection', () => {
   it('does not open a browser when the ownership check fails', async () => {
      const context = await createContext(),
         open = vi.spyOn(browserLaunch, 'openUrlInBrowser');
      vi.spyOn(context.adapter, 'runOwned').mockRejectedValue(
         new Error('Ownership lost'),
      );

      await expect(
         initializeSessionTarget(
            { target: 'voiceover', url: 'https://createdbyfireside.com/' },
            context.adapter,
         ),
      ).rejects.toThrow('Ownership lost');

      expect(open).not.toHaveBeenCalled();
   });

   it('selects the default browser when navigating away from a native app', async () => {
      const context = await createContext(),
         target = { appName: 'Safari' },
         url = 'https://createdbyfireside.com/';
      vi.spyOn(browserLaunch, 'openUrlInBrowser').mockResolvedValue({
         focusTarget: target,
      });
      vi.spyOn(context.adapter, 'focus').mockResolvedValue({
         status: 'focused',
         target,
         platform: 'voiceover',
      });
      vi.spyOn(guidepup, 'waitForWindowFocus').mockResolvedValue({
         focused: true,
         waitedMs: 0,
      });
      const app = await initializeSessionTarget(
         { target: 'voiceover', url, app: { appName: 'TextEdit' } },
         context.adapter,
      );

      expect(browserLaunch.openUrlInBrowser).toHaveBeenCalledWith(url, undefined);
      expect(app).to.eql(target);
   });
});

describe('shared virtual document startup', () => {
   it.each(['jsdom', 'browser'] as const)(
      'loads the initial document once with %s',
      async (engine) => {
         const context = await createContext(),
            url = 'https://createdbyfireside.com/';
         vi.spyOn(guidepup, 'createDriverAdapter').mockReturnValue(context.adapter);
         vi.spyOn(virtualHost, 'createVirtualHost').mockResolvedValue({
            ...guidepup.createJsdomVirtualHost(),
            engine,
         });
         const attach = vi.spyOn(context.adapter, 'attachDocument'),
            fetch = vi
               .spyOn(globalThis, 'fetch')
               .mockResolvedValue(new Response('<h1>Fireside</h1>'));
         await createDriverSessionContext({
            target: 'virtual',
            sessionId: 'initial-url',
            metadataFile: 'in-memory://initial-url',
            socketPath: 'in-memory://initial-url',
            persist: false,
            url,
            engine,
         });

         expect(fetch).toHaveBeenCalledTimes(engine === 'jsdom' ? 1 : 0);
         expect(attach).toHaveBeenCalledExactlyOnceWith({
            html: engine === 'jsdom' ? '<h1>Fireside</h1>' : '',
            url,
         });
      },
   );

   it('stops the started adapter when initial document loading fails', async () => {
      const context = await createContext(),
         stop = vi.spyOn(context.adapter, 'stop');
      vi.spyOn(guidepup, 'createDriverAdapter').mockReturnValue(context.adapter);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Fixture load failed'));

      await expect(
         createDriverSessionContext({
            target: 'virtual',
            sessionId: 'failed-url',
            metadataFile: 'in-memory://failed-url',
            socketPath: 'in-memory://failed-url',
            persist: false,
            url: 'https://createdbyfireside.com/',
            engine: 'jsdom',
         }),
      ).rejects.toMatchObject({
         code: 'target-unavailable',
         details: { cause: 'Fixture load failed' },
      });

      expect(stop).toHaveBeenCalledTimes(1);
   });
});

describe('navigation failure isolation', () => {
   it.each(['observation', 'metadata'])(
      'blocks subsequent input after %s fails',
      async (phase) => {
         const context = await createContext(),
            input = vi.spyOn(context.adapter, 'performPortable');
         vi.spyOn(context.adapter, 'attachDocument').mockResolvedValue();
         if (phase === 'observation') {
            vi.spyOn(context.adapter, 'readState').mockRejectedValueOnce(
               new Error('Observation unavailable'),
            );
         } else {
            vi.spyOn(context, 'writeMetadata').mockRejectedValueOnce(
               new Error('Disk unavailable'),
            );
         }
         const opened = await handleBrokerRequest(context, {
            command: 'attach-document',
            payload: { html: '', url: 'https://createdbyfireside.com/' },
         });
         const attempted = await handleBrokerRequest(context, {
            command: 'action',
            action: 'activate',
         });

         expect(opened.response.ok).toStrictEqual(false);
         expect(opened.shouldStop).toStrictEqual(true);
         expect(attempted.response.error?.code).toStrictEqual('session-stopping');
         expect(input).not.toHaveBeenCalled();
      },
   );

   it('stops an in-process transport when opening its document fails', async () => {
      const context = await createContext(),
         stop = vi.fn(async () => context.adapter.stop());
      vi.spyOn(context.adapter, 'attachDocument').mockRejectedValueOnce(
         new Error('Navigation failed'),
      );
      const transport = createContextTransport({
         context,
         session: { sr: 'virtual', mode: 'in-process', engine: 'jsdom' },
         load: async () => ({ html: '', url: 'https://createdbyfireside.com/' }),
         stop,
      });

      await expect(
         transport.open({ url: 'https://createdbyfireside.com/' }),
      ).rejects.toThrow('Navigation failed');
      await expect(transport.status()).rejects.toMatchObject({
         code: 'session-stopping',
      });

      expect(stop).toHaveBeenCalledTimes(1);
   });
});
