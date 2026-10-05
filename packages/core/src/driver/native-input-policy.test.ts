import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixture } from '../../../guidepup/src/test-fixtures.js';
import { nvda, voiceOver } from '../../../guidepup/src/upstream.js';
import { createDriverSessionContext, stopSessionResources } from './session-context.js';
import type { BrokerHandlerContext } from './broker-types.js';
import { handleBrokerRequest } from './broker-handlers.js';
import { createContextTransport } from './screen-reader-context.js';
import { sendSessionRequest } from './broker-runtime.js';
import { openBrokerConnection } from './broker-connection.js';

vi.mock('../../../guidepup/src/desktop-lease.js', () => ({
   acquireDesktopLease: vi.fn(),
}));
vi.mock('../../../guidepup/src/reader-status.js', () => ({
   isRealReaderStopped: vi.fn(),
}));
vi.mock('../../../guidepup/src/ax-properties-mac.js', () => ({
   queryFocusedAxProperties: vi.fn(),
}));

const contexts: BrokerHandlerContext[] = [];

afterEach(async () => {
   await Promise.all(
      contexts
         .splice(0)
         .map((context) =>
            stopSessionResources(context.adapter, context.finishRecording),
         ),
   );
   vi.restoreAllMocks();
   vi.clearAllMocks();
});

async function createContext(
   target: 'voiceover' | 'nvda',
): Promise<BrokerHandlerContext> {
   createFixture(target);
   const { context } = await createDriverSessionContext({
      target,
      sessionId: 'test_native_policy',
      metadataFile: 'in-memory://native-policy',
      socketPath: 'in-memory://native-policy',
      persist: false,
      nativeInput: 'require-binding',
   });
   contexts.push(context);
   return context;
}

describe('shared native input policy', () => {
   it.each(['voiceover', 'nvda'] as const)(
      'blocks %s broker typing and library activation with no upstream input',
      async (target) => {
         const context = await createContext(target),
            transport = createContextTransport({
               context,
               session: {
                  sr: target,
                  mode: 'in-process',
                  nativeInput: context.session.nativeInput,
               },
               load: async () => ({ html: '', url: 'https://createdbyfireside.com/' }),
               stop: async () =>
                  stopSessionResources(context.adapter, context.finishRecording),
            }),
            upstream = target === 'voiceover' ? voiceOver : nvda;
         const result = await handleBrokerRequest(context, {
            command: 'action',
            action: 'type',
            payload: { text: 'Fixture' },
         });

         expect(context.session.nativeInput).toBe('require-binding');
         expect(result.response.error).toMatchObject({
            code: 'native-target-binding-unavailable',
         });
         await expect(transport.run({ action: 'activate' })).rejects.toMatchObject({
            code: 'native-target-binding-unavailable',
         });
         expect(upstream.type).not.toHaveBeenCalled();
         expect(upstream.act).not.toHaveBeenCalled();
         expect(upstream.press).not.toHaveBeenCalled();
         expect(upstream.perform).not.toHaveBeenCalled();
         const state = await transport.status();

         expect(state.state.observations?.targetIdentity.status).toBe('observed');
      },
   );

   it('blocks a valid raw reader command without entering the upstream queue', async () => {
      const context = await createContext('voiceover'),
         result = await handleBrokerRequest(context, {
            command: 'action',
            action: 'perform',
            payload: { command: 'voiceover-keycode:hear-item-description' },
         });

      expect(result.response.error).toMatchObject({
         code: 'native-target-binding-unavailable',
      });
      expect(voiceOver.perform).not.toHaveBeenCalled();
   });
});

describe('legacy native owners', () => {
   it('refuses actions and batches from a session with no recorded input policy', async () => {
      const context = await createContext('voiceover'),
         session = { ...context.session, nativeInput: undefined };

      await expect(
         sendSessionRequest(session, { command: 'action', action: 'activate' }),
      ).rejects.toMatchObject({
         code: 'native-input-policy-missing',
      });
      expect(() => openBrokerConnection(session)).toThrow('native input policy');
      expect(voiceOver.act).not.toHaveBeenCalled();
   });
});
