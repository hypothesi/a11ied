import { describe, expect, it, vi } from 'vitest';

import type {
   AccessibilityDriverSession,
   DriverCheckpoint,
   DriverStateSnapshot,
   SessionRecording,
} from '@a11ied/contracts';
import { driverCapabilities, type DriverAdapter } from '@a11ied/guidepup';

import { handleBrokerRequest } from './broker-handlers.js';
import type { BrokerHandlerContext } from './broker-types.js';
import { TranscriptRecorder } from './transcript.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const COMPLETED_RECORDING: SessionRecording = {
      path: '/tmp/session.mov',
      format: 'mov',
      status: 'completed',
      startedAt: '2026-04-08T00:00:00.000Z',
      stoppedAt: '2026-04-08T00:00:10.000Z',
   },
   RECORDING_FAILURE_MESSAGE =
      'The native recorder stopped without writing "/tmp/session.mov".';

function createSession(): AccessibilityDriverSession {
   return {
      sessionId: 'drv_test',
      target: 'voiceover',
      targetType: 'real',
      startedAt: '2026-04-08T00:00:00.000Z',
      capabilities: driverCapabilities,
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
      app: { appName: 'Google Chrome' },
   };
}

function createState(phrases: string[]): DriverStateSnapshot {
   return {
      lastSpokenPhrase: phrases.at(-1) ?? '',
      currentItemText: phrases.at(-1) ?? '',
      spokenPhraseLog: phrases,
      itemTextLog: phrases,
      logCursor: phrases.length,
      checkpoints: [],
      transcript: [],
   };
}

function createMockAdapter(): DriverAdapter {
   const phrases = ['Button'];
   return {
      target: 'voiceover',
      async runOwned<TResult>(run: () => Promise<TResult>): Promise<TResult> {
         return run();
      },
      capabilities: driverCapabilities,
      checkReadiness: vi.fn<DriverAdapter['checkReadiness']>(),
      start: vi.fn<DriverAdapter['start']>(),
      stop: vi.fn<DriverAdapter['stop']>(),
      type: vi.fn<DriverAdapter['type']>(),
      performCommand: vi.fn<DriverAdapter['performCommand']>().mockResolvedValue({
         target: 'voiceover',
         commandSet: 'voiceover-commander',
         alias: 'move-right',
         upstreamKey: 'MOVE_RIGHT',
         requestedCommand: 'move-right',
      }),
      performPortable: vi.fn<DriverAdapter['performPortable']>(async () => {
         phrases.push('Link');
      }),
      navigate: vi.fn<DriverAdapter['navigate']>(async () => {
         phrases.push('Heading');
         return { moved: true };
      }),
      readCurrentItem: vi.fn<DriverAdapter['readCurrentItem']>(async () => ({
         item: { states: [], phrase: phrases.at(-1) ?? '', source: 'test' },
         position: phrases.at(-1) ?? '',
      })),
      readTitle: vi.fn<DriverAdapter['readTitle']>().mockResolvedValue({
         title: 'Example',
         source: 'test',
      }),
      findText: vi.fn<DriverAdapter['findText']>().mockResolvedValue({ found: true }),
      moveInTable: vi.fn<DriverAdapter['moveInTable']>().mockResolvedValue({}),
      captureCursorScreenshot: vi
         .fn<DriverAdapter['captureCursorScreenshot']>()
         .mockResolvedValue({ path: '/tmp/shot.png', source: 'test' }),
      press: vi.fn<DriverAdapter['press']>(),
      focus: vi.fn<DriverAdapter['focus']>().mockResolvedValue({
         status: 'focused',
         target: { appName: 'Google Chrome' },
         platform: 'voiceover',
      }),
      readState: vi.fn<DriverAdapter['readState']>(async (checkpoints) => ({
         ...createState([...phrases]),
         checkpoints,
      })),
      waitForSpeechStabilization: vi.fn<DriverAdapter['waitForSpeechStabilization']>(),
      attachDocument: vi.fn<DriverAdapter['attachDocument']>(),
   };
}

function createContext(args: {
   completedRecording?: SessionRecording;
}): BrokerHandlerContext {
   const checkpoints: DriverCheckpoint[] = [];
   const transcript = new TranscriptRecorder();
   // Sessions capture the phrases spoken at start before the first action arrives.
   transcript.capture(createState(['Button']));

   return {
      adapter: createMockAdapter(),
      checkpoints,
      session: createSession(),
      transcript,
      writeMetadata: vi.fn(),
      finishRecording: vi.fn().mockResolvedValue(args.completedRecording),
   };
}

describe('confirmed broker shutdown', () => {
   it('waits for native cleanup before acknowledging stop', async () => {
      const context = createContext({});
      let release: () => void = vi.fn(),
         settled = false;
      vi.mocked(context.adapter.stop).mockImplementation(
         () =>
            new Promise<void>((resolve) => {
               release = resolve;
            }),
      );
      const stopped = handleBrokerRequest(context, { command: 'stop' }).then((result) => {
         settled = true;
         return result;
      });
      await vi.waitFor(() => expect(context.adapter.stop).toHaveBeenCalledTimes(1));

      expect(settled).toStrictEqual(false);
      expect(context.resourcesStopped).toBeUndefined();
      release();
      const result = await stopped;

      expect(result.response.ok).toStrictEqual(true);
      expect(context.resourcesStopped).toStrictEqual(true);
   });

   it('retains failed shutdown for retry and refuses input in between', async () => {
      const context = createContext({});
      vi.mocked(context.adapter.stop).mockRejectedValueOnce(
         new Error('Native stop failed'),
      );
      const failed = await handleBrokerRequest(context, { command: 'stop' });
      const input = await handleBrokerRequest(context, {
         command: 'action',
         action: 'activate',
      });
      const retried = await handleBrokerRequest(context, { command: 'stop' });

      expect(failed.response.ok).toStrictEqual(false);
      expect(failed.shouldStop).toStrictEqual(false);
      expect(input.response.error?.code).toStrictEqual('session-stopping');
      expect(context.adapter.performPortable).not.toHaveBeenCalled();
      expect(retried.response.ok).toStrictEqual(true);
      expect(retried.shouldStop).toStrictEqual(true);
   });
});

describe('broker stop handling', () => {
   it('returns completed recording metadata in the stop result', async () => {
      const context = createContext({ completedRecording: COMPLETED_RECORDING });

      const result = await handleBrokerRequest(context, { command: 'stop' });

      expect(result.shouldStop).toBe(true);
      expect(result.response.ok).toBe(true);
      expect(result.response.result?.session.recording).toEqual(COMPLETED_RECORDING);
      expect(context.writeMetadata).toHaveBeenCalledWith(
         expect.objectContaining({ recording: COMPLETED_RECORDING, logCursor: 1 }),
      );
   });

   it('surfaces recording stop failures without pretending the session vanished', async () => {
      const context = createContext({});
      context.finishRecording = vi
         .fn()
         .mockRejectedValue(
            new CliEnvironmentError('recording-file-missing', RECORDING_FAILURE_MESSAGE),
         );

      const result = await handleBrokerRequest(context, { command: 'stop' });

      expect(result.shouldStop).toBe(true);
      expect(result.response.ok).toBe(false);
      expect(result.response.error).toEqual({
         code: 'recording-file-missing',
         message: RECORDING_FAILURE_MESSAGE,
         details: { cleanupConfirmed: true },
         exitCode: 3,
      });
      expect(context.writeMetadata).toHaveBeenCalledWith(
         expect.objectContaining({ logCursor: 1 }),
      );
   });
});

describe('broker action handling', () => {
   it('performs named driver commands through the adapter', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'perform',
         payload: { command: 'move-right', commandSet: 'voiceover-commander' },
         timeoutMs: 1234,
      });

      expect(result.response.ok).toBe(true);
      expect(context.adapter.performCommand).toHaveBeenCalledWith(
         { command: 'move-right', commandSet: 'voiceover-commander' },
         { timeoutMs: 1234 },
      );
      expect(context.adapter.waitForSpeechStabilization).toHaveBeenCalled();
      expect(result.response.result?.details?.command).toMatchObject({
         alias: 'move-right',
         commandSet: 'voiceover-commander',
      });
   });

   it('routes a next with a kind through navigate and reports the move', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'next',
         payload: { kind: 'heading', level: 2 },
      });

      expect(context.adapter.navigate).toHaveBeenCalledWith(
         { direction: 'next', kind: 'heading', level: 2 },
         {},
      );
      expect(context.adapter.performPortable).not.toHaveBeenCalled();
      expect(result.response.result?.details).toEqual({
         navigation: { direction: 'next', kind: 'heading', level: 2 },
         moved: true,
      });
   });

   it('routes portable verbs through performPortable and timestamps new phrases', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'next',
      });

      expect(context.adapter.performPortable).toHaveBeenCalledWith('next', {});
      expect(
         result.response.result?.state.transcript.map((entry) => entry.phrase),
      ).toEqual(['Link']);
      expect(result.response.result?.state.transcript[0]?.at).toMatch(
         /^\d{4}-\d{2}-\d{2}T/,
      );
   });
});

describe('broker action input', () => {
   it('presses each chord in order', async () => {
      const context = createContext({});

      await handleBrokerRequest(context, {
         command: 'action',
         action: 'press',
         payload: { keys: ['Tab', 'Shift+Tab'] },
      });

      expect(context.adapter.press).toHaveBeenCalledWith(['Tab', 'Shift+Tab'], {});
   });

   it('rejects a press without keys as a usage error', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'press',
         payload: { key: 'Tab' },
      });

      expect(result.response.ok).toBe(false);
      expect(result.response.error?.code).toBe('validation-error');
      expect(context.adapter.press).not.toHaveBeenCalled();
   });
});

describe('broker action state', () => {
   it('focuses the app the session opened when focus has no payload', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'focus',
      });

      expect(context.adapter.focus).toHaveBeenCalledWith({ appName: 'Google Chrome' });
      expect(result.response.result?.details?.focus).toMatchObject({ status: 'focused' });
   });

   it('records checkpoints as transcript entries', async () => {
      const context = createContext({});

      const result = await handleBrokerRequest(context, {
         command: 'action',
         action: 'checkpoint',
         payload: { label: 'dialog open' },
      });

      expect(result.response.result?.state.checkpoints).toEqual([
         expect.objectContaining({ label: 'dialog open' }),
      ]);
      expect(result.response.result?.state.transcript.at(-1)).toMatchObject({
         checkpoint: 'dialog open',
         phrase: '',
      });
   });
});
