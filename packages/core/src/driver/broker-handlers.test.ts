import { describe, expect, it, vi } from 'vitest';

import type {
   AccessibilityDriverSession,
   DriverCapability,
   DriverCheckpoint,
   DriverStateSnapshot,
   SessionRecording,
} from '@a11ied/contracts';

import { handleBrokerRequest } from './broker-handlers.js';
import type { BrokerHandlerContext } from './broker-types.js';

const COMPLETED_RECORDING: SessionRecording = {
   path: '/tmp/session.mov',
   format: 'mov',
   status: 'completed',
   startedAt: '2026-04-08T00:00:00.000Z',
   stoppedAt: '2026-04-08T00:00:10.000Z',
};

const RECORDING_FAILURE_MESSAGE =
   'The native recorder stopped without writing "/tmp/session.mov".';

function createSession(): AccessibilityDriverSession {
   return {
      sessionId: 'drv_test',
      target: 'voiceover',
      targetType: 'real',
      startedAt: '2026-04-08T00:00:00.000Z',
      capabilities: [
         'start',
         'stop',
         'status',
         'attach-document',
         'focus',
         'next',
         'previous',
         'key',
         'type',
         'perform',
         'interact',
         'stop-interacting',
         'click-current-item',
         'read',
         'logs',
         'clear-logs',
         'checkpoint',
      ] satisfies DriverCapability[],
      logCursor: 0,
      brokerPid: 123,
      socketPath: '/tmp/a11ied-drv_test.sock',
      metadataFile: '/tmp/a11ied-drv_test.json',
      recording: {
         path: '/tmp/session.mov',
         format: 'mov',
         status: 'active',
         startedAt: '2026-04-08T00:00:00.000Z',
      },
   };
}

function createState(): DriverStateSnapshot {
   return {
      lastSpokenPhrase: 'Button',
      currentItemText: 'Button',
      spokenPhraseLog: ['Button'],
      itemTextLog: ['Button'],
      logCursor: 1,
      checkpoints: [],
   };
}

function createContext(args: {
   session?: AccessibilityDriverSession;
   completedRecording?: SessionRecording;
}): BrokerHandlerContext {
   const checkpoints: DriverCheckpoint[] = [];
   const session = args.session ?? createSession();

   return {
      adapter: {
         performCommand: vi.fn().mockResolvedValue({
            target: 'voiceover',
            commandSet: 'voiceover-commander',
            alias: 'move-right',
            upstreamKey: 'MOVE_RIGHT',
            requestedCommand: 'move-right',
         }),
         readState: vi.fn().mockResolvedValue(createState()),
         waitForSpeechStabilization: vi.fn(),
      } as unknown as BrokerHandlerContext['adapter'],
      checkpoints,
      session,
      writeMetadata: vi.fn(),
      finishRecording: vi.fn().mockResolvedValue(args.completedRecording),
   };
}

describe('broker stop handling', () => {
   it('returns completed recording metadata in the stop result', async () => {
      const context = createContext({ completedRecording: COMPLETED_RECORDING });

      const result = await handleBrokerRequest(context, {
         command: 'stop',
      });

      expect(result.shouldStop).toBe(true);
      expect(result.response.ok).toBe(true);
      expect(result.response.result?.session.recording).toEqual(COMPLETED_RECORDING);
      expect(context.writeMetadata).toHaveBeenCalledWith(
         expect.objectContaining({
            recording: COMPLETED_RECORDING,
            logCursor: 1,
         }),
      );
   });

   it('surfaces recording stop failures without pretending the session vanished', async () => {
      const context = createContext({});
      context.finishRecording = vi.fn().mockRejectedValue(
         Object.assign(new Error(RECORDING_FAILURE_MESSAGE), {
            code: 'recording-file-missing',
         }),
      );

      const result = await handleBrokerRequest(context, {
         command: 'stop',
      });

      expect(result.shouldStop).toBe(true);
      expect(result.response.ok).toBe(false);
      expect(result.response.error).toEqual({
         code: 'recording-file-missing',
         message: RECORDING_FAILURE_MESSAGE,
      });
      expect(context.writeMetadata).toHaveBeenCalledWith(
         expect.objectContaining({
            logCursor: 1,
         }),
      );
   });
});

describe('broker action handling', () => {
   it('performs named driver commands through the adapter', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'perform',
         payload: {
            command: 'move-right',
            commandSet: 'voiceover-commander',
         },
      });

      expect(result.response.ok).toBe(true);
      expect(context.adapter.performCommand).toHaveBeenCalledWith({
         command: 'move-right',
         commandSet: 'voiceover-commander',
      });
      expect(context.adapter.waitForSpeechStabilization).toHaveBeenCalled();
      expect(result.response.result?.details?.command).toMatchObject({
         alias: 'move-right',
         commandSet: 'voiceover-commander',
      });
   });
});
